import { App, Plugin, TFile, Notice, PluginSettingTab, Setting, TextComponent } from 'obsidian';

interface LocalLLMAssistantSettings {
	ollamaHost: string;
	qdrantHost: string;
	qdrantCollection: string;
	embeddingModel: string;
}

const DEFAULT_SETTINGS: LocalLLMAssistantSettings = {
	ollamaHost: 'http://localhost:11434',
	qdrantHost: 'http://localhost:6333',
	qdrantCollection: 'obsidian_notes',
	embeddingModel: 'nomic-embed-text'
}

export default class LocalLLMAssistant extends Plugin {
	settings: LocalLLMAssistantSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Add a ribbon icon
		const ribbonIconEl = this.addRibbonIcon('brain', 'Local LLM Assistant', async () => {
			await this.processAllNotes();
		});

		// Add settings tab
		this.addSettingTab(new LocalLLMAssistantSettingsTab(this.app, this));

		// Register event to process new or modified notes
		this.registerEvent(
			this.app.vault.on('modify', async (file: TFile) => {
				if (file.extension === 'md') {
					await this.processNote(file);
				}
			})
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async processAllNotes() {
		const files = this.app.vault.getMarkdownFiles();
		let processed = 0;
		
		new Notice(`Processing ${files.length} notes...`);
		
		for (const file of files) {
			await this.processNote(file);
			processed++;
			if (processed % 10 === 0) {
				new Notice(`Processed ${processed}/${files.length} notes`);
			}
		}
		
		new Notice('All notes processed!');
	}

	async processNote(file: TFile) {
		try {
			const content = await this.app.vault.read(file);
			const embedding = await this.getEmbedding(content);
			await this.storeEmbedding(file.path, embedding);
		} catch (error) {
			console.error(`Error processing note ${file.path}:`, error);
			new Notice(`Failed to process note: ${file.path}`);
		}
	}

	async getEmbedding(text: string): Promise<number[]> {
		const response = await fetch(`${this.settings.ollamaHost}/api/embeddings`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.settings.embeddingModel,
				prompt: text
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to get embedding: ${response.statusText}`);
		}

		const data = await response.json();
		return data.embedding;
	}

	async storeEmbedding(path: string, embedding: number[]) {
		const point = {
			id: this.hashPath(path),
			payload: { path },
			vector: embedding
		};

		const response = await fetch(`${this.settings.qdrantHost}/collections/${this.settings.qdrantCollection}/points`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				points: [point]
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to store embedding: ${response.statusText}`);
		}
	}

	private hashPath(path: string): string {
		// Simple hash function for demo purposes
		let hash = 0;
		for (let i = 0; i < path.length; i++) {
			const char = path.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString();
	}
}

class LocalLLMAssistantSettingsTab extends PluginSettingTab {
	plugin: LocalLLMAssistant;

	constructor(app: App, plugin: LocalLLMAssistant) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'Local LLM Assistant Settings'});

		new Setting(containerEl)
			.setName('Ollama Host')
			.setDesc('The URL of your Ollama instance')
			.addText((text: TextComponent) => text
				.setPlaceholder('http://localhost:11434')
				.setValue(this.plugin.settings.ollamaHost)
				.onChange(async (value: string) => {
					this.plugin.settings.ollamaHost = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Qdrant Host')
			.setDesc('The URL of your Qdrant instance')
			.addText((text: TextComponent) => text
				.setPlaceholder('http://localhost:6333')
				.setValue(this.plugin.settings.qdrantHost)
				.onChange(async (value: string) => {
					this.plugin.settings.qdrantHost = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Qdrant Collection')
			.setDesc('The name of the collection to store embeddings')
			.addText((text: TextComponent) => text
				.setPlaceholder('obsidian_notes')
				.setValue(this.plugin.settings.qdrantCollection)
				.onChange(async (value: string) => {
					this.plugin.settings.qdrantCollection = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Embedding Model')
			.setDesc('The Ollama model to use for generating embeddings')
			.addText((text: TextComponent) => text
				.setPlaceholder('nomic-embed-text')
				.setValue(this.plugin.settings.embeddingModel)
				.onChange(async (value: string) => {
					this.plugin.settings.embeddingModel = value;
					await this.plugin.saveSettings();
				}));
	}
}
