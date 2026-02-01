import streamlit as st
import os

st.title("Reproduction Script - Checkbox Limit")

# Mock file names
files = [f"file_{i}.xlsx" for i in range(1, 50)]

if "selected_files" not in st.session_state:
    st.session_state.selected_files = []

st.sidebar.header("Files")

selected = []
for f in files:
    key = f"chk_{f}"
    if key not in st.session_state:
        st.session_state[key] = False
    
    if st.sidebar.checkbox(f, key=key):
        selected.append(f)

st.write(f"Selected count: {len(selected)}")
st.write("Selected files:", selected)

if len(selected) > 14:
    st.warning("More than 14 selected!")
