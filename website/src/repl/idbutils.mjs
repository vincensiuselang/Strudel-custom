import { registerSound, onTriggerSample } from '@strudel/webaudio';
import { isAudioFile } from './files.mjs';
import { logger } from '@strudel/core';

//utilites for writing and reading to the indexdb

export const userSamplesDBConfig = {
  dbName: 'samples',
  table: 'usersamples',
  columns: ['blob', 'title'],
  version: 1,
};

// deletes all of the databases, useful for debugging
function clearIDB() {
  window.indexedDB
    .databases()
    .then((r) => {
      for (var i = 0; i < r.length; i++) window.indexedDB.deleteDatabase(r[i].name);
    })
    .then(() => {
      alert('All data cleared.');
    });
}

// queries the DB, and registers the sounds so they can be played
export function registerSamplesFromDB(config = userSamplesDBConfig, onComplete = () => {}) {
  openDB(config, (objectStore) => {
    const query = objectStore.getAll();
    query.onerror = (e) => {
      logger('User Samples failed to load ', 'error');
      onComplete();
      console.error(e?.target?.error);
    };

    query.onsuccess = (event) => {
      const soundFiles = event.target.result;
      if (!soundFiles?.length) {
        onComplete();
        return;
      }

      Promise.all(
        soundFiles.map(soundFile => {
          if (!soundFile || soundFile.title === undefined || !isAudioFile(soundFile.title)) {
            return null;
          }
          const name = soundFile.title.substring(0, soundFile.title.lastIndexOf('.')) || soundFile.title;
          return blobToDataUrl(soundFile.blob).then(soundPath => {
            return { name, soundPath };
          });
        })
      )
      .then(results => {
        const validSounds = results.filter(Boolean);
        validSounds.forEach(({ name, soundPath }) => {
          const soundUrlArray = [soundPath];
          registerSound(name, (t, hapValue, onended) => onTriggerSample(t, hapValue, onended, soundUrlArray), {
            type: 'sample',
            samples: soundUrlArray,
            baseUrl: undefined,
            prebake: false,
            tag: 'user'
          });
        });
        logger('imported sounds registered!', 'success');
        onComplete();
      })
      .catch((error) => {
        logger('Something went wrong while registering saved samples from the index db', 'error');
        console.error(error);
        onComplete();
      });
    };
  });
}

async function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    var reader = new FileReader();
    reader.onload = function (event) {
      resolve(event.target.result);
    };
    reader.readAsDataURL(blob);
  });
}

//open db and initialize it if necessary
function openDB(config, onOpened) {
  const { dbName, version, table, columns } = config;
  if (typeof window === 'undefined') {
    return;
  }
  if (!('indexedDB' in window)) {
    console.log('IndexedDB is not supported.');
    return;
  }
  const dbOpen = indexedDB.open(dbName, version);

  dbOpen.onupgradeneeded = (_event) => {
    const db = dbOpen.result;
    const objectStore = db.createObjectStore(table, { keyPath: 'id', autoIncrement: false });
    columns.forEach((c) => {
      objectStore.createIndex(c, c, { unique: false });
    });
  };
  dbOpen.onerror = (err) => {
    logger('Something went wrong while trying to open the the client DB', 'error');
    console.error(`indexedDB error: ${err.errorCode}`);
  };

  dbOpen.onsuccess = () => {
    const db = dbOpen.result;
    // lock store for writing
    const writeTransaction = db.transaction([table], 'readwrite');
    // get object store
    const objectStore = writeTransaction.objectStore(table);
    onOpened(objectStore, db);
  };
  return dbOpen;
}

async function processFilesForIDB(files) {
  return Promise.all(
    Array.from(files)
      .map((s) => {
        const title = s.name;

        if (!isAudioFile(title)) {
          return;
        }
        //create obscured url to file system that can be fetched
        const sUrl = URL.createObjectURL(s);
        //fetch the sound and turn it into a buffer array
        return fetch(sUrl).then((res) => {
          return res.blob().then((blob) => {
            const path = s.webkitRelativePath;
            let id = path?.length ? path : title;
            if (id == null || title == null || blob == null) {
              return;
            }
            return {
              title,
              blob,
              id,
            };
          });
        });
      })
      .filter(Boolean),
  ).catch((error) => {
    logger('Something went wrong while processing uploaded files', 'error');
    console.error(error);
  });
}

export async function uploadSamplesToDB(config, files, onComplete) {
  logger('procesing user samples...');
  const processedFiles = Array.isArray(files) ? files : [files];

  const onOpened = (objectStore, _db) => {
    logger('index db opened... writing files to db');
    processedFiles.forEach((file) => {
      if (file == null) {
        return;
      }
      objectStore.put(file);
    });
    logger('user samples written successfully');
    onComplete();
  };
  openDB(config, onOpened);
}
