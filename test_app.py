import streamlit as st
from streamlit_video_editor import video_editor_timeline
import numpy as np
import base64

st.set_page_config(layout="wide")
st.title("Streamlit Video Editor Timeline Demo")

# Upload a video file
video_file = st.file_uploader("Upload a video file", type=["mp4", "mov", "webm", "avi"])

# Generate dummy waveform data (simulate audio amplitude)
DURATION = 10  # seconds (for demo)
WAVEFORM_POINTS = 200
waveform_data = (np.abs(np.sin(np.linspace(0, 10 * np.pi, WAVEFORM_POINTS))) * 0.8 + 0.2).tolist()

# Generate dummy frame thumbnails (use a single color image for demo)
def make_dummy_frame(color: str) -> str:
    # 1x30 px PNG, base64
    import io
    from PIL import Image
    img = Image.new("RGB", (1, 30), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"

frame_data = [make_dummy_frame(color) for color in ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#00FFFF", "#FF00FF"] * 10]

if video_file is not None:
    # Read the uploaded file as bytes
    video_bytes = video_file.read()
    # Show the timeline editor
    result = video_editor_timeline(
        video_data=video_bytes,
        waveform_data=waveform_data,
        frame_data=frame_data,
        # height=1200,
        key="timeline-demo"
    )
    st.subheader("Crop Result")
    st.write(result)
else:
    st.info("Please upload a video file to use the timeline editor.") 