import useEvent from '@src/useEvent.mjs';
import { useStore } from '@nanostores/react';
import { getAudioContext, soundMap, connectToDestination, loadBuffer } from '@strudel/webaudio';
import { useMemo, useRef, useState, useEffect } from 'react';
import { registerSamplesFromDB, userSamplesDBConfig, clearUserSamples } from '../../idbutils.mjs';
import { setOnRecordingCompleteCallback } from '../../../lib/audioRecorder.mjs';

function SoundEntry({ name, data, onTrigger, trigRef, isChild = false }) {
  const ref = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (data.type === 'sample') {
          const samples = Array.isArray(data.samples)
            ? data.samples.map((s) => s.path)
            : Object.values(data.samples)
                .flat()
                .map((s) => s.path);
          samples.forEach((sampleUrl) => {
            loadBuffer(sampleUrl, getAudioContext());
          });
        }
        observer.disconnect();
      }
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [data]);

  return (
    <span
      ref={ref}
      key={name}
      className="cursor-pointer hover:opacity-50"
      onMouseDown={async () => {
        const ctx = getAudioContext();
        const params = {
          note: ['synth', 'soundfont'].includes(data.type) ? 'a3' : undefined,
          s: name,
          clip: 1,
          release: 0.5,
          sustain: 1,
          duration: 0.5,
        };
        const time = ctx.currentTime + 0.05;
        const onended = () => trigRef.current?.node?.disconnect();
        trigRef.current = Promise.resolve(onTrigger(time, params, onended));
        trigRef.current.then((ref) => {
          connectToDestination(ref?.node);
        });
      }}
    >
      {' '}
      {name}
      {!isChild && data?.type === 'sample' ? `(${getSamples(data.samples)})` : ''}
      {data?.type === 'soundfont' ? `(${data.fonts.length})` : ''}
    </span>
  );
}

function SoundTree({ soundEntries, onTrigger, trigRef }) {
  const [expanded, setExpanded] = useState({});

  const toggle = (name) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div>
      {soundEntries.map(([name, { data, onTrigger: groupOnTrigger }]) => (
        <div key={name} className="mb-2">
          <div onClick={() => toggle(name)} className="font-bold uppercase text-accent cursor-pointer flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={`size-5 mr-2 transform ${expanded[name] ? 'rotate-90' : 'rotate-0'}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            {name} ({data.samples.length})
          </div>
          {expanded[name] && (
            <div className="pl-4 flex flex-col">
              {data.samples.map((sample, i) => (
                <SoundEntry
                  key={`${name}:${i}`}
                  name={sample.title}
                  data={data}
                  onTrigger={(t, p, o) => groupOnTrigger(t, { ...p, s: name, n: i }, o)}
                  trigRef={trigRef}
                  isChild={true}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

import { settingsMap, useSettings } from '../../../settings.mjs';
import { ButtonGroup } from './Forms.jsx';
import ImportSoundsButton from './ImportSoundsButton.jsx';
import { Textbox } from '../textbox/Textbox.jsx';

const getSamples = (samples) =>
  Array.isArray(samples) ? samples.length : typeof samples === 'object' ? Object.values(samples).length : 1;

export function SoundsTab() {
  const sounds = useStore(soundMap);
  const { soundsFilter } = useSettings();
  const [search, setSearch] = useState('');
  const { BASE_URL } = import.meta.env;
  const baseNoTrailing = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;

  const soundEntries = useMemo(() => {
    if (!sounds) {
      return [];
    }

    let filtered = Object.entries(sounds)
      .filter(([key]) => !key.startsWith('_'))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([name]) => name.toLowerCase().includes(search.toLowerCase()));

    if (soundsFilter === 'user') {
      return filtered.filter(([_, { data }]) => !data.prebake);
    }
    if (soundsFilter === 'drums') {
      return filtered.filter(([_, { data }]) => data.type === 'sample' && data.tag === 'drum-machines');
    }
    if (soundsFilter === 'samples') {
      return filtered.filter(([_, { data }]) => data.type === 'sample' && data.tag !== 'drum-machines');
    }
    if (soundsFilter === 'synths') {
      return filtered.filter(([_, { data }]) => ['synth', 'soundfont'].includes(data.type));
    }
    if (soundsFilter === 'importSounds') {
      return [];
    }
    return filtered;
  }, [sounds, soundsFilter, search]);

  // holds mutable ref to current triggered sound
  const trigRef = useRef();

  // stop current sound on mouseup
  useEvent('mouseup', () => {
    const t = trigRef.current;
    trigRef.current = undefined;
    t?.then((ref) => {
      ref?.stop(getAudioContext().currentTime + 0.01);
    });
  });

  useEffect(() => {
    setOnRecordingCompleteCallback(() => {
      registerSamplesFromDB(userSamplesDBConfig);
    });
  }, []);

  return (
    <div id="sounds-tab" className="px-4 flex flex-col w-full h-full text-foreground">
      <Textbox placeholder="Search" value={search} onChange={(v) => setSearch(v)} />

      <div className="pb-2 flex shrink-0 flex-wrap">
        <ButtonGroup
          value={soundsFilter}
          onChange={(value) => settingsMap.setKey('soundsFilter', value)}
          items={{
            samples: 'samples',
            drums: 'drum-machines',
            synths: 'Synths',
            user: 'User',
            importSounds: 'import-sounds',
          }}
        ></ButtonGroup>
      </div>

      <div className="min-h-0 max-h-full grow overflow-auto  text-sm break-normal pb-2">
        {soundsFilter === 'user' ? (
          <SoundTree
            soundEntries={soundEntries}
            onTrigger={(t, p, o) => soundMap.get()[p.s].onTrigger(t, p, o)}
            trigRef={trigRef}
          />
        ) : (
          soundEntries.map(([name, { data, onTrigger }]) => (
            <SoundEntry key={name} name={name} data={data} onTrigger={onTrigger} trigRef={trigRef} />
          ))
        )}
        {!soundEntries.length && soundsFilter === 'importSounds' ? (
          <div className="prose dark:prose-invert min-w-full pt-2 pb-8 px-4">
            <div className="flex gap-2">
              <ImportSoundsButton onComplete={() => settingsMap.setKey('soundsFilter', 'user')} />
              <button
                className="flex items-center bg-background p-4 w-fit rounded-xl hover:opacity-50 whitespace-nowrap cursor-pointer"
                onClick={async () => { // Added async here
                  if (window.confirm('Are you sure you want to delete all user samples?')) {
                    await clearUserSamples(); // Added await here
                    // After clearing, re-register samples to refresh the view
                    registerSamplesFromDB(userSamplesDBConfig, () => {
                      settingsMap.setKey('soundsFilter', 'user'); // Stay on user tab
                    });
                  }
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="size-6 mr-2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                  />
                </svg>
                Clear Samples
              </button>
            </div>
            <p>
              To import sounds into Strudel, you can upload a folder containing audio files (.wav, .mp3, etc.).
              All audio files within the uploaded folder, including those in subfolders, will be added to the "User" tab.
              They will be grouped under titles corresponding to their parent folder/subfolder names.
            </p>
            <pre className="bg-background" key={'sample-diagram'}>
              {`└─ MyDrumKit <-- import this folder
   ├─ Kicks
   │  ├─ kick_01.wav
   │  └─ kick_02.wav
   ├─ Snares
   │  ├─ snare_a.wav
   │  └─ snare_b.wav
   └─ Hats
      ├─ hat_open.wav
      └─ hat_closed.wav`}
            </pre>
            <p>
              In the "User" tab, this would appear as:
            </p>
            <pre className="bg-background" key={'display-diagram'}>
              {`KICKS
  kick_01.wav
  kick_02.wav
SNARES
  snare_a.wav
  snare_b.wav
HATS
  hat_open.wav
  hat_closed.wav`}
            </pre>
            <p>
              For more information, and other ways to use your own sounds in Strudel,{' '}
              <a href={`${baseNoTrailing}/learn/samples/#from-disk-via-import-sounds-folder`} target="_blank">
                check out the docs
              </a>
              !
            </p>
          </div>
        ) : (
          ''
        )}
        {!soundEntries.length && soundsFilter !== 'importSounds'
          ? 'No custom sounds loaded in this pattern (yet).'
          : ''}
      </div>
    </div>
  );
}