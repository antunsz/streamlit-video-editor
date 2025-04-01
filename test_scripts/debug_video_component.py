import streamlit as st
import os
from streamlit_video_editor import video_editor_timeline
from moviepy.editor import VideoFileClip

# Set page config
st.set_page_config(page_title="Video Editor Debug", layout="wide")

st.title("Video Duration Debug")

# File uploader
uploaded_file = st.file_uploader("Upload a video file", type=["mp4", "avi", "mov", "mkv"])

if uploaded_file:
    # Save the uploaded file to a temporary location
    temp_path = f"temp_video_{uploaded_file.name}"
    with open(temp_path, "wb") as f:
        f.write(uploaded_file.getbuffer())
    
    # Load video with MoviePy to check actual duration
    clip = VideoFileClip(temp_path)
    st.write(f"Actual video duration: {clip.duration} seconds")
    st.write(f"Video size: {uploaded_file.size} bytes")
    
    # Create columns for debugger panel and video
    col1, col2 = st.columns([1, 3])
    
    with col1:
        st.subheader("Debug Panel")
        st.write("Choose what to test:")
        test_direct_player = st.checkbox("Test direct HTML5 player", value=True)
        test_component = st.checkbox("Test streamlit_video_editor component", value=True)
        show_verbose = st.checkbox("Show verbose information", value=False)
    
    with col2:
        if test_direct_player:
            st.subheader("Direct HTML5 Video Player")
            st.video(temp_path)
        
        if test_component:
            st.subheader("Streamlit Video Editor Component")
            # Debug outputs
            if show_verbose:
                st.write("Before calling component")
            
            # Call the component
            result = video_editor_timeline(
                video_path=temp_path,
                height=500
            )
            
            # Debug outputs 
            if show_verbose:
                st.write("After calling component")
                st.write("Component result:", result)
    
    # Clean up the temporary file
    if os.path.exists(temp_path):
        os.remove(temp_path) 