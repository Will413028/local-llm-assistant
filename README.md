# Local LLM Assistant for Obsidian

A plugin for Obsidian that uses local LLMs (via Ollama) and vector database (Qdrant) to provide semantic search capabilities for your notes.

## Features

- **Semantic Note Processing**: Automatically generates embeddings for your notes using Ollama's embedding models
- **Find Similar Notes**: Discover semantically related notes based on content similarity, not just keyword matches
- **Real-time Updates**: Automatically processes notes as you create or modify them
- **Local Privacy**: All processing happens locally on your machine - no data leaves your system

## Requirements

1. [Ollama](https://ollama.ai/) - For generating note embeddings
   - Default model: `nomic-embed-text`
   - Default host: `http://localhost:11434`

2. [Qdrant](https://qdrant.tech/) - For vector similarity search
   - Default host: `http://localhost:6333`
   - Can be installed via Docker: `docker run -p 6333:6333 qdrant/qdrant`

## Installation

1. Install the plugin from Obsidian's Community Plugins
2. Enable the plugin in Obsidian's settings
3. Configure the plugin settings if your Ollama or Qdrant instances use different hosts

## Usage

### Initial Setup

1. After installing and enabling the plugin, click the brain icon in the left sidebar to process all existing notes
2. The plugin will generate embeddings for all your notes and store them in Qdrant
3. Progress notifications will show the processing status

### Finding Similar Notes

1. Open any note in Obsidian
2. Use one of these methods to find similar notes:
   - Open the Command Palette (Cmd/Ctrl+P) and search for "Find Similar Notes"
   - Click the brain icon in the left sidebar

A modal will appear showing up to 5 most similar notes, with similarity scores. Click any note in the results to open it.

### Automatic Updates

The plugin automatically processes any new or modified notes, so your semantic search index stays up to date as you work.

## Settings

The plugin settings can be configured in Obsidian's settings panel:

- **Ollama Host**: The URL of your Ollama instance
- **Qdrant Host**: The URL of your Qdrant instance
- **Qdrant Collection**: The name of the collection to store embeddings
- **Embedding Model**: The Ollama model to use for generating embeddings

## How It Works

1. When you create or modify a note, the plugin sends its content to Ollama to generate an embedding vector
2. The embedding vector is stored in Qdrant along with the note's path
3. When you search for similar notes, the current note's embedding is compared with all other notes' embeddings using cosine similarity
4. Notes with similarity scores above 70% are shown in the results

## Privacy & Security

All processing happens locally:
- Embeddings are generated locally using Ollama
- Vectors are stored locally in Qdrant
- No data is sent to external servers
- No internet connection required after initial setup

## Troubleshooting

If you encounter issues:

1. Ensure Ollama is running and accessible at the configured host
2. Ensure Qdrant is running and accessible at the configured host
3. Check the console for any error messages
4. Try reprocessing all notes by clicking the brain icon
