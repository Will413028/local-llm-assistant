import { App, Plugin, TFile, Notice, PluginSettingTab, Setting, TextComponent, Modal, WorkspaceLeaf } from 'obsidian';

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
		await this.ensureCollectionExists();

		// Register event to handle note deletion
		this.registerEvent(
			this.app.vault.on('delete', async (file: TFile) => {
				if (file.extension === 'md') {
					await this.deleteEmbedding(file.path);
				}
			})
		);

		// Add command to find similar notes
		this.addCommand({
			id: 'find-similar-notes',
			name: 'Find Similar Notes',
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice('No active file');
					return;
				}
				await this.findSimilarNotes(activeFile);
			}
		});

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

	async findSimilarNotes(file: TFile) {
		try {
			const content = await this.app.vault.read(file);
			const embedding = await this.getEmbedding(content);
			
			const response = await fetch(`${this.settings.qdrantHost}/collections/${this.settings.qdrantCollection}/points/search`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					vector: embedding,
					limit: 5,
					with_payload: true,
					score_threshold: 0.7
				})
			});

			if (!response.ok) {
				throw new Error(`Failed to search similar notes: ${response.statusText}`);
			}

			const data = await response.json();
			const results = data.result;

			if (results.length === 0) {
				new Notice('No similar notes found');
				return;
			}

			// Create modal to display results
			const modal = new SimilarNotesModal(this.app, results, file.path);
			modal.open();

		} catch (error) {
			console.error('Error finding similar notes:', error);
			new Notice('Failed to find similar notes');
		}
	}

	async deleteEmbedding(path: string) {
		try {
			const pointId = this.hashPath(path);
			const response = await fetch(`${this.settings.qdrantHost}/collections/${this.settings.qdrantCollection}/points/delete`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					points: [pointId]
				})
			});

			if (!response.ok) {
				throw new Error(`Failed to delete embedding: ${response.statusText}`);
			}
			new Notice(`Embedding deleted for: ${path}`);
		} catch (error) {
			console.error(`Error deleting embedding for ${path}:`, error);
			new Notice(`Failed to delete embedding for: ${path}`);
		}
	}

	private hashPath(path: string): number {
		// Simple hash function for demo purposes
		let hash = 0;
		for (let i = 0; i < path.length; i++) {
			const char = path.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return Math.abs(hash);
	}

	private async ensureCollectionExists() {
		try {
			// Check if collection exists
			const response = await fetch(`${this.settings.qdrantHost}/collections/${this.settings.qdrantCollection}`);
			
			if (response.status === 404) {
				// Collection doesn't exist, create it
				const createResponse = await fetch(`${this.settings.qdrantHost}/collections/${this.settings.qdrantCollection}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						vectors: {
							size: 768,
							distance: "Cosine"
						}
					})
				});

				if (!createResponse.ok) {
					throw new Error(`Failed to create collection: ${createResponse.statusText}`);
				}
				
				console.log(`Created Qdrant collection: ${this.settings.qdrantCollection}`);
			}
		} catch (error) {
			console.error('Error ensuring collection exists:', error);
			new Notice('Failed to initialize Qdrant collection');
		}
	}
}

class SimilarNotesModal extends Modal {
	private results: any[];
	private currentPath: string;

	constructor(app: App, results: any[], currentPath: string) {
		super(app);
		this.results = results;
		this.currentPath = currentPath;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();

		contentEl.createEl('h2', {text: 'Similar Notes'});

		const list = contentEl.createEl('div', {cls: 'similar-notes-list'});

		this.results.forEach(result => {
			if (result.payload.path === this.currentPath) return; // Skip current note

			const item = list.createEl('div', {cls: 'similar-note-item'});
			
			const link = item.createEl('a', {
				text: result.payload.path,
				cls: 'similar-note-link'
			});
			
			const score = item.createEl('span', {
				text: ` (${(result.score * 100).toFixed(1)}% similar)`,
				cls: 'similar-note-score'
			});

			link.addEventListener('click', async (e: MouseEvent) => {
				e.preventDefault();
				const targetFile = this.app.vault.getAbstractFileByPath(result.payload.path);
				if (targetFile instanceof TFile) {
					await this.app.workspace.getLeaf().openFile(targetFile);
					this.close();
				}
			});
		});

		// Add styles
		contentEl.createEl('style', {
			text: `
				.similar-notes-list {
					margin-top: 1em;
				}
				.similar-note-item {
					padding: 8px;
					border-bottom: 1px solid var(--background-modifier-border);
				}
				.similar-note-link {
					color: var(--text-accent);
					text-decoration: none;
				}
				.similar-note-link:hover {
					text-decoration: underline;
				}
				.similar-note-score {
					color: var(--text-muted);
				}
			`
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
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
