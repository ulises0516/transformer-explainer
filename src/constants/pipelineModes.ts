export type PipelineMode = 'vision' | 'summarization';

export type PipelineNode = {
	id: string;
	title: string;
	subtitle: string;
	detail: string;
	metric: string;
	accent: string;
	vectors: string[];
	insights: string[];
};

export type PipelineEdge = {
	from: string;
	to: string;
	opacity: number;
	width: number;
};

export type PipelineConfig = {
	title: string;
	description: string;
	nodes: PipelineNode[];
	edges: PipelineEdge[];
	operationTitle: string;
	operationSubtitle: string;
	operationLabels: string[];
};

export const pipelineModes: Record<PipelineMode, PipelineConfig> = {
	vision: {
		title: 'Vision Flow',
		description: 'An image becomes clean pixels, visual features, a compact representation, class scores, and an explained prediction.',
		nodes: [
			{
				id: 'input',
				title: 'Image Input',
				subtitle: 'fish_reef_014.jpg',
				detail: 'raw pixels / RGB',
				metric: '224 x 224 x 3',
				accent: '#7c3aed',
				vectors: ['red', 'green', 'blue', 'pixels', 'subject', 'background'],
				insights: [
					'The model starts with numbers, not the idea of a fish.',
					'Each pixel contributes red, green, and blue channel values.',
					'The subject is centered enough for the model to inspect useful regions.'
				]
			},
			{
				id: 'preprocess',
				title: 'Preprocessing',
				subtitle: 'Resize + normalize',
				detail: 'standard tensor',
				metric: 'clean input',
				accent: '#2563eb',
				vectors: ['resize', 'crop', 'mean', 'std', 'tensor', 'batch'],
				insights: [
					'The image is resized so every example has the same shape.',
					'Pixel values are normalized to match the model training distribution.',
					'The result is a structured tensor the network can process consistently.'
				]
			},
			{
				id: 'features',
				title: 'Feature Extraction',
				subtitle: 'Edges become textures',
				detail: 'patterns detected',
				metric: 'feature maps',
				accent: '#0ea5e9',
				vectors: ['edges', 'stripes', 'texture', 'color', 'fins', 'tail'],
				insights: [
					'Early visual processing detects simple patterns like edges and color changes.',
					'Middle features respond to textures, stripes, and repeated shapes.',
					'Useful activations are passed forward while weak signals fade.'
				]
			},
			{
				id: 'representation',
				title: 'Representation',
				subtitle: 'Parts become meaning',
				detail: 'compact visual code',
				metric: '1280 features',
				accent: '#10b981',
				vectors: ['body', 'stripe', 'fin', 'shape', 'habitat', 'pose'],
				insights: [
					'The model combines simple patterns into a compact description of the image.',
					'Important regions contribute more strongly than background clutter.',
					'The representation is close to examples with similar body shape and stripes.'
				]
			},
			{
				id: 'classifier',
				title: 'Classifier Head',
				subtitle: 'Scores classes',
				detail: 'logits to softmax',
				metric: '42 classes',
				accent: '#14b8a6',
				vectors: ['clownfish', 'tang', 'goby', 'ray', 'eel', 'wrasse'],
				insights: [
					'The classifier turns the representation into one score per class.',
					'Softmax converts raw scores into probabilities that sum to 100%.',
					'The top score is well separated from the nearest alternatives.'
				]
			},
			{
				id: 'explanation',
				title: 'Explanation',
				subtitle: 'Why clownfish?',
				detail: 'saliency + evidence',
				metric: '92.4% top-1',
				accent: '#f59e0b',
				vectors: ['92.4%', '3.1%', '1.7%', '1.0%', '0.9%', '0.9%'],
				insights: [
					'The highlighted regions show where evidence most affected the decision.',
					'The model focused on orange body color, white stripes, and fin shape.',
					'Alternative classes are much lower, so the prediction is confident.'
				]
			}
		],
		edges: [
			{ from: 'input', to: 'preprocess', opacity: 0.4, width: 2 },
			{ from: 'preprocess', to: 'features', opacity: 0.55, width: 3 },
			{ from: 'features', to: 'representation', opacity: 0.7, width: 4 },
			{ from: 'representation', to: 'classifier', opacity: 0.78, width: 4 },
			{ from: 'classifier', to: 'explanation', opacity: 0.9, width: 5 }
		],
		operationTitle: 'Visual Evidence',
		operationSubtitle: 'Signals that carry the prediction',
		operationLabels: ['pixels', 'edges', 'texture', 'parts', 'scores', 'why']
	},
	summarization: {
		title: 'Summarization Flow',
		description: 'Prompt tokens are routed into salient facts, compressed, checked, then written as a concise answer.',
		nodes: [
			{
				id: 'prompt',
				title: 'Prompt',
				subtitle: 'Summarize article',
				detail: '312 input tokens',
				metric: '1 request',
				accent: '#8b5cf6',
				vectors: ['context', 'goal', 'facts', 'tone', 'length', 'focus'],
				insights: [
					'Instruction parser identifies objective as concise factual summary.',
					'Prompt intent leans extractive over abstractive generation.',
					'Length controller sets a 3-line target budget.'
				]
			},
			{
				id: 'embed',
				title: 'Context Embed',
				subtitle: 'Token + position',
				detail: 'hidden size 768',
				metric: '0.8ms',
				accent: '#6366f1',
				vectors: ['token-12', 'token-48', 'token-73', 'token-95', 'token-128', 'token-154'],
				insights: [
					'Entity-heavy tokens receive stronger positional emphasis.',
					'Topic anchors remain stable across nearby token neighborhoods.',
					'Rare-token smoothing prevents outlier domination.'
				]
			},
			{
				id: 'decode',
				title: 'Decode',
				subtitle: 'Autoregressive',
				detail: '42 generated tokens',
				metric: '28ms',
				accent: '#06b6d4',
				vectors: ['draft-1', 'draft-2', 'draft-3', 'draft-4', 'draft-5', 'draft-6'],
				insights: [
					'Decoder prioritizes high-coverage sentences first.',
					'Repetition gate suppresses near-duplicate phrase candidates.',
					'Beam alternatives converge on the same core claim set.'
				]
			},
			{
				id: 'evaluate',
				title: 'Quality Check',
				subtitle: 'Repetition + length',
				detail: 'pass / adjust',
				metric: 'ROUGE-L 0.41',
				accent: '#22c55e',
				vectors: ['coverage', 'clarity', 'facts', 'compression', 'cohesion', 'bias'],
				insights: [
					'Fact consistency checker finds no unsupported assertions.',
					'Compression ratio remains in target range with minimal information loss.',
					'Cohesion score improves after connective phrase adjustments.'
				]
			},
			{
				id: 'summary',
				title: 'Summary',
				subtitle: 'Final answer',
				detail: 'Concise 3 lines',
				metric: 'Ready',
				accent: '#f97316',
				vectors: ['line-1', 'line-2', 'line-3', 'keywords', 'confidence', 'done'],
				insights: [
					'Final summary preserves the primary narrative arc.',
					'Named entities retained with correct relations.',
					'Confidence is highest for sentence-1 and sentence-2 claims.'
				]
			}
		],
		edges: [
			{ from: 'prompt', to: 'embed', opacity: 0.45, width: 2 },
			{ from: 'embed', to: 'decode', opacity: 0.6, width: 3 },
			{ from: 'decode', to: 'evaluate', opacity: 0.75, width: 4 },
			{ from: 'evaluate', to: 'summary', opacity: 0.95, width: 5 }
		],
		operationTitle: 'Context Routing',
		operationSubtitle: 'Token saliency alignment + compression',
		operationLabels: ['topic', 'facts', 'cause', 'result', 'tone', 'summary']
	}
};
