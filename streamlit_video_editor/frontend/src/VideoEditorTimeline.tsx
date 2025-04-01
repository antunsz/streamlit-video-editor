import React, { useEffect, useRef, useState } from 'react';
import {
  Streamlit,
  withStreamlitConnection,
} from 'streamlit-component-lib';

interface VideoEditorTimelineProps {
  args: {
    video_url: string;
    height: number;
    waveform_data: number[];
    frame_data: string[];
  };
  theme?: {
    base: string;
    primaryColor: string;
    backgroundColor: string;
    secondaryBackgroundColor: string;
    textColor: string;
    font: string;
  };
}

const VideoEditorTimeline: React.FC<VideoEditorTimelineProps> = ({ args, theme }) => {
  const isDraggingRef = useRef<boolean>(false);
  const activeMarkerRef = useRef<'start' | 'end' | null>(null);
  const effectiveTheme = theme || {
    base: "light",
    primaryColor: "#000",
    backgroundColor: "#fff",
    secondaryBackgroundColor: "#f0f0f0",
    textColor: "#000",
    font: "sans-serif"
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [cropMode, setCropMode] = useState(false);
  const [cropStartTime, setCropStartTime] = useState(0);
  const [cropEndTime, setCropEndTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [audioData, setAudioData] = useState<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    // Inform Streamlit that the component is ready
    Streamlit.setComponentReady();

    // Set up video metadata and audio analysis
    const video = videoRef.current;
    if (video) {
      video.addEventListener('loadedmetadata', () => {
        setVideoDuration(video.duration);
        setupAudioAnalysis(video);
      });

      return () => {
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        video.removeEventListener('loadedmetadata', () => {});
      };
    }
  }, []);

  const formatTime = (seconds: number): string => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
  };

  const handleCropApply = () => {
    // Send crop times back to Python
    Streamlit.setComponentValue({ 
      start: cropStartTime, 
      end: cropEndTime,
      shouldRefreshTaskList: true
    });
    setCropMode(false);
  };

  const handleToggleCrop = () => {
    if (!cropMode) {
      setCropStartTime(videoDuration * 0.1);
      setCropEndTime(videoDuration * 0.9);
    }
    setCropMode(!cropMode);
  };

  const handleMarkerMouseDown = (markerType: 'start' | 'end') => (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    activeMarkerRef.current = markerType;
    document.addEventListener('mousemove', handleMarkerDrag);
    document.addEventListener('mouseup', handleMarkerMouseUp);
  };

  const handleMarkerDrag = (e: MouseEvent) => {
    if (!isDraggingRef.current || !timelineRef.current || !activeMarkerRef.current) return;

    const timeline = timelineRef.current.getBoundingClientRect();
    const timelineWidth = timeline.width;
    const timelineLeft = timeline.left;

    let position = (e.clientX - timelineLeft) / timelineWidth;
    position = Math.max(0, Math.min(1, position));
    const newTime = position * videoDuration;

    if (activeMarkerRef.current === 'start') {
      if (newTime < cropEndTime) {
        setCropStartTime(newTime);
        if (videoRef.current) {
          videoRef.current.currentTime = newTime;
        }
      }
    } else {
      if (newTime > cropStartTime) {
        setCropEndTime(newTime);
        if (videoRef.current) {
          videoRef.current.currentTime = newTime;
        }
      }
    }
  };

  const handleMarkerMouseUp = () => {
    isDraggingRef.current = false;
    activeMarkerRef.current = null;
    document.removeEventListener('mousemove', handleMarkerDrag);
    document.removeEventListener('mouseup', handleMarkerMouseUp);
  };

  const handleMarkerDoubleClick = (time: number) => () => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const setupAudioAnalysis = (video: HTMLVideoElement) => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const source = audioContext.createMediaElementSource(video);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const updateAudioData = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      setAudioData(Array.from(dataArray));
      requestAnimationFrame(updateAudioData);
    };

    updateAudioData();
  };

  return (
    <div style={{
      fontFamily: effectiveTheme.font,
      color: effectiveTheme.textColor,
      backgroundColor: effectiveTheme.backgroundColor,
      padding: '10px',
    }}>
      <div className="container">
        <video
          ref={videoRef}
          controls
          style={{ width: '100%', maxWidth: '100%' }}
          onError={(e) => console.error('Video loading error:', e)}
        >
          <source src={args.video_url} type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        <div className="timeline-wrapper" ref={timelineRef}>
          <div className="timeline-labels">
            <div className="timeline-label" style={{ paddingBottom: '10px', paddingTop: '10px' }}>VIDEO</div>
            <div className="timeline-label">AUDIO</div>
          </div>
          <div className="timeline-container">
            <div className="video-track">
              <div className="frame-thumbnails">
                {args.frame_data && args.frame_data.length > 0 ? (
                  args.frame_data.map((frame, index) => (
                    <div
                      key={index}
                      className="frame-thumbnail"
                      style={{
                        backgroundImage: `url("${frame}")`,
                        width: `${100 / args.frame_data.length}%`
                      }}
                    />
                  ))
                ) : (
                  // Generate empty thumbnails if no frame data
                  Array.from({ length: 10 }).map((_, index) => (
                    <div
                      key={index}
                      className="frame-thumbnail"
                      style={{
                        backgroundImage: `url("data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==")`,
                        width: '10%'
                      }}
                    />
                  ))
                )}
              </div>
            </div>
            <div className="audio-track">
              <div className="audio-waveform">
                {args.waveform_data && args.waveform_data.length > 0 ? (
                  args.waveform_data.map((value, index) => {
                    // Ensure value is at least 0.2 for visibility
                    const effectiveHeight = Math.max(value, 0.2) * 100;
                    return (
                      <div
                        key={index}
                        className="waveform-bar"
                        style={{
                          height: `${effectiveHeight}%`,
                          backgroundColor: effectiveTheme.primaryColor || 'rgba(255, 75, 75, 0.8)',
                        }}
                      />
                    );
                  })
                ) : (
                  // Generate default bars if no waveform data
                  Array.from({ length: 100 }).map((_, index) => {
                    // Create a varied pattern based on index
                    const height = 20 + 15 * Math.sin(index * Math.PI / 10);
                    return (
                      <div
                        key={index}
                        className="waveform-bar"
                        style={{
                          height: `${height}%`,
                          backgroundColor: effectiveTheme.primaryColor || 'rgba(255, 75, 75, 0.8)',
                          flexBasis: `${100 / 100}%`,
                          minWidth: 0
                        }}
                      />
                    );
                  })
                )}
              </div>
            </div>
            {cropMode && (
              <>
                <div
                  className="crop-marker"
                  style={{
                    left: `${(cropStartTime / videoDuration) * 100}%`,
                    cursor: 'ew-resize'
                  }}
                  onMouseDown={handleMarkerMouseDown('start')}
                  onDoubleClick={handleMarkerDoubleClick(cropStartTime)}
                >
                  <div className="crop-label">{formatTime(cropStartTime)}</div>
                </div>
                <div
                  className="crop-marker"
                  style={{
                    left: `${(cropEndTime / videoDuration) * 100}%`,
                    cursor: 'ew-resize'
                  }}
                  onMouseDown={handleMarkerMouseDown('end')}
                  onDoubleClick={handleMarkerDoubleClick(cropEndTime)}
                >
                  <div className="crop-label">{formatTime(cropEndTime)}</div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="button-container">
          {!cropMode ? (
            <button
              className="btn"
              onClick={handleToggleCrop}
              style={{ backgroundColor: effectiveTheme.primaryColor }}
            >
              Modo de Corte
            </button>
          ) : (
            <>
              <button
                className="btn"
                onClick={handleCropApply}
                style={{ backgroundColor: effectiveTheme.primaryColor }}
              >
                Aplicar Corte
              </button>
              <button
                className="btn"
                onClick={() => setCropMode(false)}
                style={{ backgroundColor: effectiveTheme.primaryColor }}
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default withStreamlitConnection(VideoEditorTimeline);