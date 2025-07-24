import { registerSound, onTriggerSample, soundMap } from '@strudel/webaudio';
import { isAudioFile } from './files.mjs';
import { logger } from '@strudel/core';

// Utilities for writing and reading to IndexedDB

export const userSamplesDBConfig = {
  dbName: 'samples',
  table: 'usersamples',
  columns: ['blob', 'title'],
  version: 1,
};

// Open DB and initialize it if necessary
function openDB(config) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !'indexedDB' in window) {
      console.log('IndexedDB is not supported.');
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const dbOpen = indexedDB.open(config.dbName, config.version);

    dbOpen.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(config.table)) {
        const objectStore = db.createObjectStore(config.table, { keyPath: 'id', autoIncrement: false });
        config.columns.forEach((c) => {
          objectStore.createIndex(c, c, { unique: false });
        });
      }
    };

    dbOpen.onerror = (event) => {
      logger('Error opening DB', 'error');
      console.error(`IndexedDB error: ${event.target.error}`);
      reject(event.target.error);
    };

    dbOpen.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}

export function clearUserSamples(config = userSamplesDBConfig) {
  return new Promise(async (resolve, reject) => {
    let db;
    try {
      db = await openDB(config);
      const transaction = db.transaction([config.table], 'readwrite');
      const objectStore = transaction.objectStore(config.table);
      objectStore.clear();

      transaction.oncomplete = () => {
        const allSounds = soundMap.get();
        const soundsToKeep = Object.entries(allSounds).reduce((acc, [key, value]) => {
          if (value.data.tag !== 'user') {
            acc[key] = value;
          }
          return acc;
        }, {});
        soundMap.set(soundsToKeep);
        logger('User samples cleared!', 'success');
        db.close();
        resolve();
      };

      transaction.onerror = (event) => {
        logger('Failed to clear user samples', 'error');
        db.close();
        reject(event.target.error);
      };
    } catch (error) {
      logger('Error in clearUserSamples', 'error');
      console.error(error);
      if (db) db.close();
      reject(error);
    }
  });
}

export function registerSamplesFromDB(config = userSamplesDBConfig, onComplete = () => {}) {
  (async () => {
    let db;
    try {
      db = await openDB(config);
      const transaction = db.transaction([config.table], 'readonly');
      const objectStore = transaction.objectStore(config.table);
      const query = objectStore.getAll();

      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();

      query.onsuccess = async (event) => {
        const soundFiles = event.target.result;
        if (!soundFiles?.length) {
          onComplete();
          return;
        }

        try {
          const results = await Promise.all(
            soundFiles.map((soundFile) => {
              if (!soundFile || soundFile.title === undefined || !isAudioFile(soundFile.title)) {
                return null;
              }
              const name = soundFile.title.substring(0, soundFile.title.lastIndexOf('.')) || soundFile.title;
              return { name, blob: soundFile.blob, title: soundFile.title };
            }),
          );

          const validSounds = results.filter(Boolean);

          validSounds.forEach(({ name, blob }) => {
            registerSound(name, (t, hapValue, onended) => onTriggerSample(t, hapValue, onended, [blob]), {
              type: 'sample',
              samples: [{ name: name, blob: blob }],
              baseUrl: undefined,
              prebake: false,
              tag: 'user',
            });
          });

          logger('imported sounds registered!', 'success');
          onComplete();
        } catch (error) {
          logger('Something went wrong while registering saved samples from the index db', 'error');
          console.error(error);
          onComplete();
        }
      };
    } catch (error) {
      logger('Error in registerSamplesFromDB', 'error');
      console.error(error);
      if (db) db.close();
      onComplete();
    }
  })();
}

async function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.readAsDataURL(blob);
  });
}

let uniqueIdCounter = 0; // To ensure unique IDs even if webkitRelativePath is identical or missing

async function processFilesForIDB(files) {
  return Promise.all(
    Array.from(files).map((s) => {
      // If 's' is already a Blob, use it directly. Otherwise, assume it's a File or similar object.
      const blob = s instanceof Blob ? s : s.blob;
      const name = s.name || `recording_${Date.now()}`; // Use existing name or generate a generic one
      const originalName = name.substring(0, name.lastIndexOf('.')) || name;
      const sanitizedName = originalName.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
      const fileExtension = name.substring(name.lastIndexOf('.'));
      const title = `${sanitizedName}${fileExtension}`;
      const id = `${sanitizedName}_${Date.now()}_${uniqueIdCounter++}`;
      return { title, blob, id };
    }),
  );
}

export function uploadSamplesToDB(config, files) {
  return new Promise(async (resolve, reject) => {
    logger('Processing user samples...');
    let db;
    try {
      const processedFiles = await processFilesForIDB(files);

      if (!processedFiles || processedFiles.length === 0) {
        logger('No valid files to write');
        resolve();
        return;
      }

      db = await openDB(config);
      const transaction = db.transaction([config.table], 'readwrite');
      const objectStore = transaction.objectStore(config.table);

      processedFiles.forEach((file) => {
        if (file != null) {
          try {
            objectStore.put(file);
          } catch (e) {
            console.error(`Error putting file ${file.title} into IndexedDB:`, e);
          }
        }
      });

      transaction.oncomplete = () => {
        logger('User samples written successfully');
        db.close();
        resolve();
      };

      transaction.onerror = (event) => {
        logger('Transaction error while writing samples', 'error');
        db.close();
        reject(event.target.error);
      };
    } catch (error) {
      logger('Error in uploadSamplesToDB', 'error');
      console.error(error);
      if (db) db.close();
      reject(error);
    }
  });
}