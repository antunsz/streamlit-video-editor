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
  const [dynamicThumbnailCount, setDynamicThumbnailCount] = useState(100);
  const [dynamicWaveformCount, setDynamicWaveformCount] = useState(100);
  const dragOffsetRef = useRef(0);
  const initialMouseXRef = useRef<number>(0);
  const initialCropTimeRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Inform Streamlit that the component is ready
    Streamlit.setComponentReady();

    // Set up video metadata and audio analysis
    const video = videoRef.current;
    if (video) {
      video.addEventListener('loadedmetadata', () => {
        console.log(`Video loaded with duration: ${video.duration} seconds`);
        setVideoDuration(video.duration);
        
        // Calculate dynamic counts based on video duration
        // 1 thumbnail every 3 seconds with a minimum of 50 and max of 300
        const thumbnailCount = Math.min(300, Math.max(50, Math.ceil(video.duration / 3)));
        console.log(`Setting thumbnail count to: ${thumbnailCount} based on duration: ${video.duration}`);
        setDynamicThumbnailCount(thumbnailCount);
        
        // 2 waveform points per second with a minimum of 100 and max of 1000
        const waveformCount = Math.min(1000, Math.max(100, Math.ceil(video.duration * 2)));
        console.log(`Setting waveform count to: ${waveformCount} based on duration: ${video.duration}`);
        setDynamicWaveformCount(waveformCount);
        
        setupAudioAnalysis(video);
      });

      // Add an explicit error handler for video loading
      video.addEventListener('error', (e) => {
        console.error('Video loading error:', e);
        console.error('Video error code:', video.error?.code);
        console.error('Video error message:', video.error?.message);
      });

      return () => {
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        video.removeEventListener('loadedmetadata', () => {});
      };
    }
  }, []);

  // Auto-resize observer: only if user did not pass height
  useEffect(() => {
    if (args.height) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const newHeight = el.getBoundingClientRect().height;
      Streamlit.setFrameHeight(newHeight);
    });
    observer.observe(el);
    // Initial height
    Streamlit.setFrameHeight(el.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [args.height]);

  const formatTime = (seconds: number): string => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const tenth = Math.floor((seconds % 1) * 10);
    return `${min}:${sec < 10 ? '0' + sec : sec}.${tenth}`;
  };

  const handleCropApply = () => {
    // Send crop times back to Python
    Streamlit.setComponentValue({ 
      start: cropStartTime, 
      end: cropEndTime,
      shouldRefreshTaskList: true
    });
  };

  const handleToggleCrop = () => {
    if (!cropMode) {
      // Pause video playback when entering crop mode
      if (videoRef.current) {
        videoRef.current.pause();
      }

      console.log(`Setting crop markers for toggle: video duration = ${videoDuration}`);
      // Snap initial positions to the same grid (0.05s intervals)
      const startTime = Math.round(1.0 * 20) / 20;
      const endTime = Math.round((Math.max(videoDuration - 1.0, videoDuration * 0.75)) * 20) / 20;
      console.log(`Setting crop markers at: start=${startTime}, end=${endTime}`);
      setCropStartTime(startTime);
      setCropEndTime(endTime);
    }
    setCropMode(!cropMode);
  };

  const handleMarkerMouseDown = (markerType: 'start' | 'end') => (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!timelineRef.current) return;

    // Start relative drag
    isDraggingRef.current = true;
    activeMarkerRef.current = markerType;
    initialMouseXRef.current = e.clientX;
    initialCropTimeRef.current = markerType === 'start' ? cropStartTime : cropEndTime;

    console.log('Drag start', { markerType, initialMouseX: e.clientX, initialTime: initialCropTimeRef.current });

    document.addEventListener('mousemove', handleMarkerDrag);
    document.addEventListener('mouseup', handleMarkerMouseUp);
  };

  const handleMarkerDrag = (e: MouseEvent) => {
    if (!isDraggingRef.current || !timelineRef.current || !activeMarkerRef.current || videoDuration <= 0) return;

    const timelineRect = timelineRef.current.getBoundingClientRect();
    const timelineWidth = timelineRect.width;

    // Compute time delta based on horizontal movement
    const deltaX = e.clientX - initialMouseXRef.current;
    const deltaTime = (deltaX / timelineWidth) * videoDuration;
    let newTime = initialCropTimeRef.current + deltaTime;

    // Clamp and snap
    newTime = Math.max(0, Math.min(videoDuration, newTime));
    newTime = Math.round(newTime * 20) / 20;

    console.log('Dragging', { deltaX, deltaTime, newTime });

    if (activeMarkerRef.current === 'start') {
      if (newTime < cropEndTime) {
        setCropStartTime(newTime);
      }
    } else {
      if (newTime > cropStartTime) {
        setCropEndTime(newTime);
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
    <div
      ref={containerRef}
      style={{
        fontFamily: effectiveTheme.font,
        color: effectiveTheme.textColor,
        backgroundColor: effectiveTheme.backgroundColor,
        padding: '10px',
        height: args.height ? args.height : 'auto',
      }}
    >
      <div className="container">
        <video
          ref={videoRef}
          controls
          style={{ width: '100%', maxWidth: '100%' }}
          onLoadedData={() => console.log("Video data loaded successfully")}
          onError={(e) => console.error('Video loading error:', e)}
          onTimeUpdate={() => {
            // Log when video time updates to check if it's limited
            if (videoRef.current) {
              console.log(`Current time: ${videoRef.current.currentTime}, Duration: ${videoRef.current.duration}`);
            }
          }}
        >
          <source src={args.video_url} type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        <div className="timeline-wrapper">
          <div className="timeline-labels">
            <div className="timeline-label" style={{ paddingBottom: '10px', paddingTop: '10px' }}>VIDEO</div>
            <div className="timeline-label">AUDIO</div>
          </div>
          <div className="timeline-container" ref={timelineRef}>
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
                  // Generate empty thumbnails if no frame data - now using dynamic count
                  Array.from({ length: dynamicThumbnailCount }).map((_, index) => (
                    <div
                      key={index}
                      className="frame-thumbnail"
                      style={{
                        backgroundImage: `url("data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==")`,
                        width: `${100 / dynamicThumbnailCount}%`
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
                  // Generate default bars if no waveform data - now using dynamic count
                  Array.from({ length: dynamicWaveformCount }).map((_, index) => {
                    // Create a varied pattern based on index
                    const height = 20 + 15 * Math.sin(index * Math.PI / 10);
                    return (
                      <div
                        key={index}
                        className="waveform-bar"
                        style={{
                          height: `${height}%`,
                          backgroundColor: effectiveTheme.primaryColor || 'rgba(255, 75, 75, 0.8)',
                          flexBasis: `${100 / dynamicWaveformCount}%`,
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
                    left: `calc(${(cropStartTime / videoDuration) * 100}% - 1px)`,
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
                    left: `calc(${(cropEndTime / videoDuration) * 100}% - 1px)`,
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