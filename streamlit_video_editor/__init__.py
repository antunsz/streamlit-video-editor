import json
import streamlit.components.v1 as components
import os
import logging
import base64
from typing import Union, Dict, List, Any, Optional
# Import VideoFileClip from moviepy.editor (or directly from moviepy if needed)
try:
    from moviepy.editor import VideoFileClip
except ImportError:
    from moviepy import VideoFileClip

logger = logging.getLogger(__name__)

_RELEASE = True

if not _RELEASE:
    _component_func = components.declare_component(
        "video_editor_timeline",
        url="http://localhost:3001",
    )
else:
    parent_dir = os.path.dirname(os.path.abspath(__file__))
    build_dir = os.path.join(parent_dir, "frontend/build")
    if not os.path.exists(build_dir):
        # Try to find the build directory in the development environment
        repo_root = os.path.abspath(os.path.join(parent_dir, ".."))
        dev_build_dir = os.path.join(repo_root, "frontend/build")
        if os.path.exists(dev_build_dir):
            build_dir = dev_build_dir
            logger.info(f"Using development build directory: {build_dir}")
        else:
            # Fallback to site-packages location for Docker environment
            build_dir = "/usr/local/lib/python3.11/dist-packages/streamlit_video_editor/frontend/build"
            logger.info(f"Using fallback build directory: {build_dir}")
            if not os.path.exists(build_dir):
                logger.error(f"Build directory not found at: {build_dir}")
                raise FileNotFoundError(f"Component build directory not found at: {build_dir}")
    _component_func = components.declare_component("video_editor_timeline", path=build_dir)

def video_editor_timeline(
    video_url: Union[str, Dict[str, Any], bytes] = None,
    video_data: Optional[bytes] = None,
    video_path: Optional[str] = None,
    waveform_data: Optional[List[float]] = None,
    frame_data: List[Union[str, Dict[str, str]]] = [],
    height: Optional[int] = None,
    key: Optional[str] = None
) -> Optional[Dict[str, float]]:
    """Displays a video along with an editor–style timeline that shows:
      • Left–side labels for VIDEO and AUDIO.
      • Two timeline tracks (blue for video, red for audio).
      • A "Toggle Crop Mode" button that, when pressed, displays two draggable crop markers.
      • In crop mode, two extra buttons appear: "Crop" and "Cancel."
          – Dragging a marker updates the crop start/end times.
          – Double–clicking a marker jumps the video to that time.
          – Clicking "Crop" sends the selected times back to Python.
    
    Parameters
    ----------
    video_url : str or dict or bytes, optional
        URL of the video to display, or a dict with video information, or raw binary data
    video_data : bytes, optional
        Raw binary video data (alternative to video_url)
    video_path : str, optional
        Path to a local video file (alternative to video_url)
    waveform_data : list, optional
        List of audio waveform data points
    frame_data : list, optional
        List of base64 encoded frame thumbnails
    height : int
        Height of the component in pixels
    key : str or None
        Unique key for the component instance
    
    Returns
    -------
    dict or None
        Returns a dictionary with 'start' and 'end' times when crop is applied,
        or None if no crop has been applied yet
    """
    logger.info(f"Rendering video_editor_timeline component with key: {key}")
    
    # Process input parameters to get a valid video URL
    final_video_url = None
    
    # Option 1: video_url is a direct URL string
    if isinstance(video_url, str):
        logger.info(f"Video URL provided as string: {video_url[:100]}...")
        final_video_url = video_url
        
    # Option 2: video_url is a dictionary with video info
    elif isinstance(video_url, dict) and 'video_url' in video_url:
        logger.info(f"Video URL provided as dict: {video_url['video_url'][:100]}...")
        final_video_url = video_url['video_url']
        
    # Option 3: video_url is binary data
    elif isinstance(video_url, bytes):
        logger.info(f"Video provided as binary data ({len(video_url)} bytes)")
        # Create data URL (with mp4 mime type as fallback)
        b64_data = base64.b64encode(video_url).decode()
        final_video_url = f"data:video/mp4;base64,{b64_data}"
    
    # Option 4: video_data is provided
    elif video_data is not None:
        logger.info(f"Video provided as video_data ({len(video_data)} bytes)")
        
        # Try to detect mime type using file signature (magic bytes)
        mime_type = 'video/mp4'  # Default fallback
        
        # Simple magic byte detection for common video formats
        if len(video_data) > 12:  # Need at least a few bytes to check
            # Check for common video format signatures
            if video_data[:4] == b'\x00\x00\x00\x20':  # MP4 ftyp box
                mime_type = 'video/mp4'
            elif video_data[:4] == b'RIFF' and video_data[8:12] == b'AVI ':  # AVI
                mime_type = 'video/x-msvideo'
            elif video_data[:4] == b'OggS':  # Ogg
                mime_type = 'video/ogg'
            elif video_data[:4] == b'\x1a\x45\xdf\xa3':  # WebM
                mime_type = 'video/webm'
            elif video_data[:4] == b'\x00\x00\x01\xba' or video_data[:4] == b'\x00\x00\x01\xb3':  # MPEG
                mime_type = 'video/mpeg'
            # Add more signatures as needed
        
        logger.info(f"Using mime type: {mime_type} for video data")
        
        # Encode as base64
        b64_data = base64.b64encode(video_data).decode()
        final_video_url = f"data:{mime_type};base64,{b64_data}"
        logger.info(f"Created data URL with size: {len(b64_data)} characters")
    
    # Option 5: video_path is provided
    elif video_path is not None:
        logger.info(f"Video provided as path: {video_path}")
        # Check if file exists
        if not os.path.exists(video_path):
            logger.error(f"Video file not found: {video_path}")
            raise FileNotFoundError(f"Video file not found: {video_path}")
            
        # Determine mime type
        _, ext = os.path.splitext(video_path)
        mime_type = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.ogg': 'video/ogg',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
        }.get(ext.lower(), 'video/mp4')
        
        # Read file and convert to data URL regardless of size
        # This is important because file:// URLs don't work well in some environments
        try:
            with open(video_path, 'rb') as f:
                video_bytes = f.read()
                logger.info(f"Read {len(video_bytes)} bytes from {video_path}")
                b64_data = base64.b64encode(video_bytes).decode()
                final_video_url = f"data:{mime_type};base64,{b64_data}"
                logger.info(f"Created data URL from file with size: {len(b64_data)} characters")
        except Exception as e:
            logger.error(f"Error reading video file: {e}")
            # Fallback to file URL only if absolutely necessary
            final_video_url = f"file://{os.path.abspath(video_path)}"
            logger.warning(f"Falling back to file URL: {final_video_url}")
    
    # Validate we have a video URL to work with
    if not final_video_url:
        logger.error("No valid video source provided")
        raise ValueError("You must provide a valid video source: video_url, video_data, or video_path")
    
    logger.info(f"Final video URL (truncated): {final_video_url[:100]}...")
    logger.info(f"Waveform data length: {len(waveform_data) if waveform_data is not None else 0}")
    logger.info(f"Frame data length: {len(frame_data) if frame_data else 0}")
   
    # Use provided waveform data or initialize empty 
    # The size is no longer fixed as the component will dynamically adjust based on video duration
    waveform_data = waveform_data if waveform_data is not None else []
    
    # Ensure frame_data is a list of strings, not objects that will be serialized incorrectly
    safe_frame_data = []
    if frame_data:
        for i, frame in enumerate(frame_data):
            if isinstance(frame, str):
                if frame.startswith('data:image/'):
                    safe_frame_data.append(frame)
                else:
                    logger.warning(f"Frame {i} is a string but not a valid data URL")
            elif isinstance(frame, dict) and 'data' in frame:
                if isinstance(frame['data'], str) and frame['data'].startswith('data:image/'):
                    safe_frame_data.append(frame['data'])
                else:
                    logger.warning(f"Frame {i} has 'data' field but it's not a valid data URL")
            else:
                # Skip this frame if it's not in a valid format
                logger.warning(f"Skipping invalid frame data type at index {i}: {type(frame)}")
    
    logger.info(f"Safe frame data length: {len(safe_frame_data)}")
    
    # Pass video URL, waveform data, and frame data to the component
    try:
        # Build arguments for component call
        comp_args: Dict[str, Any] = dict(
            video_url=final_video_url,
            waveform_data=waveform_data,
            frame_data=safe_frame_data,
            key=key,
        )
        if height is not None:
            comp_args['height'] = height
        component_value = _component_func(**comp_args)
        logger.info(f"Component returned value: {component_value}")
        return component_value
    except Exception as e:
        logger.error(f"Error rendering video_editor_timeline component: {str(e)}")
        raise