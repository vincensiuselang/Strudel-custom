import PlayCircleIcon from '@heroicons/react/20/solid/PlayCircleIcon';
import StopCircleIcon from '@heroicons/react/20/solid/StopCircleIcon';
import { useState, useEffect, useRef } from 'react';
import { RenamePrompt } from './RenamePrompt';
import cx from '@src/cx.mjs';
import { useSettings, setIsZen } from '../../settings.mjs';
import { startRecording, stopRecording, getIsRecording, saveRecording, setOnStopPlaybackCallback } from '../../lib/audioRecorder.mjs';
import '../Repl.css';

const { BASE_URL } = import.meta.env;
const baseNoTrailing = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;

export function Header({ context, embedded = false }) {
  const { started, pending, isDirty, activeCode, handleTogglePlay, handleEvaluate, handleShuffle, handleShare, stopPlayback } =
    context;
  const isEmbedded = typeof window !== 'undefined' && (embedded || window.location !== window.parent.location);
  const { isZen, isButtonRowHidden, isCSSAnimationDisabled, fontFamily } = useSettings();
  const [isRecording, setIsRecording] = useState(getIsRecording());
  const [showRenamePrompt, setShowRenamePrompt] = useState(false);
  const [pendingRecordingBlob, setPendingRecordingBlob] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    if (isRecording) {
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
      setRecordingTime(0);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [isRecording]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording((blob) => {
        setPendingRecordingBlob(blob);
        setShowRenamePrompt(true);
      });
    } else {
      startRecording();
    }
    setIsRecording(getIsRecording());
  };

  const handleRenameConfirm = (filename, format) => {
    if (pendingRecordingBlob) {
      saveRecording(pendingRecordingBlob, filename, format);
    }
    setPendingRecordingBlob(null);
    setShowRenamePrompt(false);
  };

  const handleRenameCancel = () => {
    // Discard the recording if cancelled
    setPendingRecordingBlob(null);
    setShowRenamePrompt(false);
  };

  useEffect(() => {
    setOnStopPlaybackCallback(() => {
      stopPlayback();
    });
  }, [stopPlayback]);

  return (
    <header
      id="header"
      className={cx(
        'flex-none text-black  z-[100] text-lg select-none h-20 md:h-14',
        !isZen && !isEmbedded && 'bg-lineHighlight',
        isZen ? 'h-12 w-8 fixed top-0 left-0' : 'sticky top-0 w-full py-1 justify-between',
        isEmbedded ? 'flex' : 'md:flex',
      )}
      style={{ fontFamily }}
    >
      <div className="px-4 flex space-x-2 md:pt-0 select-none">
        <h1
          onClick={() => {
            if (isEmbedded) window.open(window.location.href.replace('embed', ''));
          }}
          className={cx(
            isEmbedded ? 'text-l cursor-pointer' : 'text-xl',
            'text-foreground font-bold flex space-x-2 items-center',
          )}
        >
          <div
            className={cx(
              'mt-[1px]',
              started && !isCSSAnimationDisabled && 'animate-spin',
              'cursor-pointer text-blue-500',
              isZen && 'fixed top-2 right-4',
            )}
            onClick={() => {
              if (!isEmbedded) {
                setIsZen(!isZen);
              }
            }}
          >
            <span className="block text-foreground rotate-90">꩜</span>
          </div>
          {!isZen && (
            <div className="space-x-2">
              <span className="">strudel</span>
              <span className="text-sm font-medium">REPL</span>
              {!isEmbedded && isButtonRowHidden && (
                <a href={`${baseNoTrailing}/learn`} className="text-sm opacity-25 font-medium">
                  DOCS
                </a>
              )}
            </div>
          )}
        </h1>
      </div>
      {!isZen && !isButtonRowHidden && (
        <div className="flex max-w-full overflow-auto text-foreground px-1 md:px-2">
          <button
            onClick={handleTogglePlay}
            title={started ? 'stop' : 'play'}
            className={cx(
              !isEmbedded ? 'p-2' : 'px-2',
              'hover:opacity-50',
              !started && !isCSSAnimationDisabled && 'animate-pulse',
            )}
          >
            {!pending ? (
              <span className={cx('flex items-center space-x-2')}>
                {started ? <StopCircleIcon className="w-6 h-6" /> : <PlayCircleIcon className="w-6 h-6" />}
                {!isEmbedded && <span>{started ? 'stop' : 'play'}</span>}
              </span>
            ) : (
              <>loading...</>
            )}
          </button>
          <button
            onClick={handleRecordToggle}
            title={isRecording ? 'stop recording' : 'start recording'}
            className={cx(
              !isEmbedded ? 'p-2' : 'px-2',
              'hover:opacity-50',
              isRecording && !isCSSAnimationDisabled && 'animate-pulse text-red-500',
              (pending || isEmbedded) && 'opacity-50 cursor-not-allowed',
            )}
            disabled={pending || isEmbedded}
          >
            <span className={cx('flex items-center space-x-2')}>
              {isRecording ? <StopCircleIcon className="w-6 h-6" /> : <PlayCircleIcon className="w-6 h-6" />}
              {!isEmbedded && <span>{isRecording ? 'stop recording' : 'record'}</span>}
              {isRecording && <span className="ml-2 text-sm">{formatTime(recordingTime)}</span>}
            </span>
          </button>
          <button
            onClick={handleEvaluate}
            title="update"
            className={cx(
              'flex items-center space-x-1',
              !isEmbedded ? 'p-2' : 'px-2',
              !isDirty || !activeCode ? 'opacity-50' : 'hover:opacity-50',
            )}
          >
            {!isEmbedded && <span>update</span>}
          </button>
          {/* !isEmbedded && (
            <button
              title="shuffle"
              className="hover:opacity-50 p-2 flex items-center space-x-1"
              onClick={handleShuffle}
            >
              <span> shuffle</span>
            </button>
          ) */}
          {!isEmbedded && (
            <button
              title="share"
              className={cx(
                'cursor-pointer hover:opacity-50 flex items-center space-x-1',
                !isEmbedded ? 'p-2' : 'px-2',
              )}
              onClick={handleShare}
            >
              <span>share</span>
            </button>
          )}
          {!isEmbedded && (
            <a
              title="learn"
              href={`${baseNoTrailing}/workshop/getting-started/`}
              className={cx('hover:opacity-50 flex items-center space-x-1', !isEmbedded ? 'p-2' : 'px-2')}
            >
              <span>learn</span>
            </a>
          )}
          {/* {isEmbedded && (
            <button className={cx('hover:opacity-50 px-2')}>
              <a href={window.location.href} target="_blank" rel="noopener noreferrer" title="Open in REPL">
                🚀
              </a>
            </button>
          )}
          {isEmbedded && (
            <button className={cx('hover:opacity-50 px-2')}>
              <a
                onClick={() => {
                  window.location.href = initialUrl;
                  window.location.reload();
                }}
                title="Reset"
              >
                💔
              </a>
            </button>
          )} */}
        </div>
      )}
      {showRenamePrompt && (
        <RenamePrompt
          defaultName={`beat-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.wav`}
          onConfirm={handleRenameConfirm}
          onCancel={handleRenameCancel}
        />
      )}
    </header>
  );
}

