# To run this code you need to install the following dependencies:
# pip install google-genai

import os
import streamlit as st
from google import genai
from google.genai import types

# Make sure the rest of your code starts AFTER these imports


def generate():
    client = genai.Client(
        api_key=st.secrets["GEMINI_API_KEY"],
    )

    model = "gemini-3.1-pro-preview"
    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text="""INSERT_INPUT_HERE"""),
            ],
        ),
    ]
    generate_content_config = types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(
            thinking_level="HIGH",
        ),
    )

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        if text := chunk.text:
            print(text, end="")

if __name__ == "__main__":
    generate()


