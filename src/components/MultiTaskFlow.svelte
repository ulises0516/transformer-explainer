<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { pipelineModes, type PipelineMode, type PipelineNode } from '~/constants/pipelineModes';

	export let mode: PipelineMode = 'vision';

	type Edge = {
		d: string;
		opacity: number;
		width: number;
		active: boolean;
		label?: string;
		labelFrom?: string;
		labelTo?: string;
		midX?: number;
		midY?: number;
	};
	type VisionTask = 'classification' | 'detection' | 'segmentation' | 'captioning';
	let wrapEl: HTMLElement;
	let vectorEls: Record<string, HTMLElement> = {};
	let topEdges: Edge[] = [];
	let backEdges: Edge[] = [];

	let hoveredStageId: string | null = null;
	let selectedStageId: string | null = null;
	let hoveredRow: number | null = null;
	let expandedStageId: string | null = null;
	let speed = 1.6;
	let density = 1;
	let glow = 0.6;
	let activeStageIdx = 0;
	let visionArchitecture: 'cnn' | 'vit' = 'cnn';
	let visionTask: VisionTask = 'classification';
	let previousMode: PipelineMode = mode;

	const key = (stageId: string, rowIdx: number) => `${stageId}-${rowIdx}`;
	const heatCells = Array.from({ length: 16 }, (_, i) => i);
	const miniRows = Array.from({ length: 6 }, (_, i) => i);
	const tokenWidths = [82, 58, 76, 46, 68, 52];
	const summaryWidths = [88, 74, 62];
	const patchCells = Array.from({ length: 9 }, (_, i) => i);
	const visionSignalRows = [1, 3, 5];
	const visionEdgeLabels: Record<string, { from: string; to: string }> = {
		'input-preprocess': { from: 'pixels', to: 'tensor' },
		'preprocess-features': { from: 'tensor', to: 'patterns' },
		'features-representation': { from: 'patterns', to: 'meaning' },
		'representation-classifier': { from: 'visual code', to: 'head' },
		'classifier-explanation': { from: 'scores', to: 'output' }
	};

	const visionTasks: Record<
		VisionTask,
		{
			label: string;
			prompt: string;
			model: string;
			dataset: string;
			output: string;
			headTitle: string;
			headSubtitle: string;
			headDetail: string;
			headMetric: string;
			headVectors: string[];
			explanationTitle: string;
			explanationSubtitle: string;
			explanationDetail: string;
			explanationMetric: string;
			explanationVectors: string[];
			headLesson: string;
			explanationLesson: string;
		}
	> = {
		classification: {
			label: 'Classification',
			prompt: 'Identify fish species from photos',
			model: 'CNN / ViT classifier',
			dataset: 'image + class label',
			output: 'one class label',
			headTitle: 'Classifier Head',
			headSubtitle: 'Scores classes',
			headDetail: 'logits to softmax',
			headMetric: '42 classes',
			headVectors: ['clownfish', 'tang', 'goby', 'ray', 'eel', 'wrasse'],
			explanationTitle: 'Explanation',
			explanationSubtitle: 'Why clownfish?',
			explanationDetail: 'saliency + evidence',
			explanationMetric: '92.4% top-1',
			explanationVectors: ['92.4%', '3.1%', '1.7%', '1.0%', '0.9%', '0.9%'],
			headLesson: 'The model turns the image representation into one score per class, then softmax turns scores into probabilities.',
			explanationLesson: 'The final class is chosen because the strongest evidence supports clownfish-like color, stripes, and body shape.'
		},
		detection: {
			label: 'Detection',
			prompt: 'Find fish in underwater images',
			model: 'Object detector',
			dataset: 'image + boxes + labels',
			output: 'boxes + labels',
			headTitle: 'Detection Head',
			headSubtitle: 'Boxes + classes',
			headDetail: 'regions to boxes',
			headMetric: '3 objects',
			headVectors: ['box-1', 'box-2', 'box-3', 'fish', 'coral', 'score'],
			explanationTitle: 'Detections',
			explanationSubtitle: 'Where are fish?',
			explanationDetail: 'bounding boxes',
			explanationMetric: '3 boxes',
			explanationVectors: ['fish 94%', 'fish 88%', 'coral 71%', 'x/y', 'width', 'height'],
			headLesson: 'Instead of choosing one label for the whole image, the detection head predicts locations and labels for visible objects.',
			explanationLesson: 'The output explains what was found and where it was found by drawing boxes around likely objects.'
		},
		segmentation: {
			label: 'Segmentation',
			prompt: 'Outline coral reefs in images',
			model: 'Segmentation model',
			dataset: 'image + pixel mask',
			output: 'pixel-level mask',
			headTitle: 'Mask Head',
			headSubtitle: 'Pixel classes',
			headDetail: 'features to mask',
			headMetric: '224 x 224 mask',
			headVectors: ['coral', 'water', 'sand', 'fish', 'edge', 'mask'],
			explanationTitle: 'Mask Output',
			explanationSubtitle: 'Which pixels?',
			explanationDetail: 'colored overlay',
			explanationMetric: 'pixel mask',
			explanationVectors: ['coral', 'water', 'boundary', 'holes', 'area', 'confidence'],
			headLesson: 'A segmentation head predicts a class for each pixel, so the output is a shape mask rather than one label.',
			explanationLesson: 'The mask shows exactly which pixels the model believes belong to coral, water, or background.'
		},
		captioning: {
			label: 'Captioning',
			prompt: 'Describe what is in an image',
			model: 'Vision-language model',
			dataset: 'image + caption',
			output: 'generated text',
			headTitle: 'Text Decoder',
			headSubtitle: 'Visual tokens to words',
			headDetail: 'image to language',
			headMetric: '12 tokens',
			headVectors: ['a', 'clownfish', 'swims', 'near', 'coral', 'reef'],
			explanationTitle: 'Caption',
			explanationSubtitle: 'Generated text',
			explanationDetail: 'attention + words',
			explanationMetric: '1 caption',
			explanationVectors: ['A', 'clownfish', 'near', 'a', 'coral', 'reef'],
			headLesson: 'Captioning uses visual features as context for a language decoder that generates words one by one.',
			explanationLesson: 'The caption is grounded in image regions: fish-like regions support nouns, and scene context supports descriptive words.'
		}
	};

	const visionLessons = {
		input: {
			question: 'What is the model looking at?',
			cnn: 'The image starts as RGB pixel values. The model has not seen "fish" yet, only numbers.',
			vit: 'The image starts as RGB pixel values. A ViT will soon split these pixels into patch tokens.'
		},
		preprocess: {
			question: 'How is the image prepared?',
			cnn: 'Resize, crop, and normalize make the image match what the model expects.',
			vit: 'Resize, crop, and normalize make patches consistent before they become tokens.'
		},
		features: {
			question: 'What patterns does the model notice first?',
			cnn: 'Convolution filters scan for edges, stripes, textures, and small shapes.',
			vit: 'The image is split into patches, and each patch becomes a vector token.'
		},
		representation: {
			question: 'How are patterns combined into meaning?',
			cnn: 'Deeper layers combine simple features into object parts and a compact visual code.',
			vit: 'Self-attention lets important patches exchange information and build a global representation.'
		},
		classifier: {
			question: 'What task-specific head is recommended?',
			cnn: '',
			vit: ''
		},
		explanation: {
			question: 'What does the output mean?',
			cnn: '',
			vit: ''
		}
	};

	$: cfg = pipelineModes[mode];
	$: activeTask = visionTasks[visionTask];
	$: activeStage = cfg.nodes[activeStageIdx] || cfg.nodes[0];
	$: focusStage = mode === 'vision' ? activeStage?.id : selectedStageId || hoveredStageId;
	$: activeLesson =
		mode === 'vision' && activeStage ? getVisionLesson(activeStage.id, activeTask) : null;

	const stageScore = (stageIdx: number) => 64 + stageIdx * 7;
	const stageSecondaryScore = (stageIdx: number) => Math.max(18, 46 - stageIdx * 6);
	const isStageActive = (stageId: string) => !focusStage || focusStage === stageId;
	const getStageSubtitle = (
		stage: PipelineNode,
		task = activeTask,
		architecture = visionArchitecture
	) => {
		if (mode !== 'vision') return stage.subtitle;
		if (stage.id === 'features') {
			return architecture === 'cnn' ? 'Filters scan image' : 'Patches become tokens';
		}
		if (stage.id === 'representation') {
			return architecture === 'cnn' ? 'Parts become meaning' : 'Patch attention';
		}
		if (stage.id === 'classifier') {
			return task.headSubtitle;
		}
		if (stage.id === 'explanation') {
			return task.explanationSubtitle;
		}
		return stage.subtitle;
	};
	const getStageTitle = (stage: PipelineNode, task = activeTask) => {
		if (mode !== 'vision') return stage.title;
		if (stage.id === 'classifier') return task.headTitle;
		if (stage.id === 'explanation') return task.explanationTitle;
		return stage.title;
	};
	const getStageDetail = (stage: PipelineNode, task = activeTask) => {
		if (mode !== 'vision') return stage.detail;
		if (stage.id === 'classifier') return task.headDetail;
		if (stage.id === 'explanation') return task.explanationDetail;
		return stage.detail;
	};
	const getStageMetric = (stage: PipelineNode, task = activeTask) => {
		if (mode !== 'vision') return stage.metric;
		if (stage.id === 'classifier') return task.headMetric;
		if (stage.id === 'explanation') return task.explanationMetric;
		return stage.metric;
	};
	const getStageVectors = (stage: PipelineNode, task = activeTask) => {
		if (mode !== 'vision') return stage.vectors;
		if (stage.id === 'classifier') return task.headVectors;
		if (stage.id === 'explanation') return task.explanationVectors;
		return stage.vectors;
	};
	const getVisionLesson = (stageId: string, task = activeTask) => {
		const lesson = visionLessons[stageId as keyof typeof visionLessons];
		if (!lesson) return null;
		if (stageId === 'classifier') {
			return {
				question: lesson.question,
				cnn: task.headLesson,
				vit: task.headLesson
			};
		}
		if (stageId === 'explanation') {
			return {
				question: lesson.question,
				cnn: task.explanationLesson,
				vit: task.explanationLesson
			};
		}
		return lesson;
	};
	const isRouteActive = (edge: { from: string; to: string }) =>
		mode !== 'vision' || edge.from === activeStage?.id || edge.to === activeStage?.id;
	const setActiveStage = (idx: number) => {
		activeStageIdx = idx;
		selectedStageId = cfg.nodes[idx]?.id || null;
		refresh();
	};

	const registerVector = (el: HTMLElement, params: { stageId: string; rowIdx: number }) => {
		vectorEls[key(params.stageId, params.rowIdx)] = el;
		refresh();
		return { destroy: () => delete vectorEls[key(params.stageId, params.rowIdx)] };
	};

	const draw = () => {
		if (!wrapEl) return;
		const bounds = wrapEl.getBoundingClientRect();
		const focusStage = selectedStageId || hoveredStageId;
		const edges: Edge[] = [];

		cfg.edges.forEach((edge) => {
			const srcStage = cfg.nodes.find((d) => d.id === edge.from);
			const dstStage = cfg.nodes.find((d) => d.id === edge.to);
			if (!srcStage || !dstStage) return;
			const rows =
				mode === 'vision'
					? visionSignalRows.filter((row) => row < srcStage.vectors.length && row < dstStage.vectors.length)
					: Array.from({ length: Math.min(srcStage.vectors.length, dstStage.vectors.length) }, (_, i) => i);
			for (const i of rows) {
				const source = vectorEls[key(edge.from, i)]?.getBoundingClientRect();
				const target = vectorEls[key(edge.to, i)]?.getBoundingClientRect();
				if (!source || !target) continue;
				const x1 = source.right - bounds.left;
				const y1 = source.top + source.height / 2 - bounds.top;
				const x2 = target.left - bounds.left;
				const y2 = target.top + target.height / 2 - bounds.top;
				const curve = Math.max((x2 - x1) * 0.45, 34);
				const stageActive = !focusStage || edge.from === focusStage || edge.to === focusStage;
				const rowActive = hoveredRow === null || hoveredRow === i;
				const active = stageActive && rowActive;
				const label = visionEdgeLabels[`${edge.from}-${edge.to}`];
				const isGuideRow = mode === 'vision' && i === visionSignalRows[1];
				const opacity =
					mode === 'vision'
						? active
							? isGuideRow
								? 0.86
								: 0.32
							: isGuideRow
								? 0.24
								: 0.1
						: active
							? edge.opacity
							: Math.max(edge.opacity * (rowActive ? 0.22 : 0.1), 0.05);
				edges.push({
					d: `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`,
					opacity,
					width: mode === 'vision' ? (isGuideRow ? 3 : 1.5) : (edge.width * density) / 2,
					active,
					label: isGuideRow && label ? `${label.from} ${label.to}` : undefined,
					labelFrom: isGuideRow ? label?.from : undefined,
					labelTo: isGuideRow ? label?.to : undefined,
					midX: (x1 + x2) / 2,
					midY: (y1 + y2) / 2 - 14
				});
			}
		});

		topEdges = edges;
		backEdges = edges.map((d) => ({
			...d,
			opacity: Math.max(d.opacity * 0.4, 0.04),
			width: Math.max(d.width * 0.9, 1)
		}));
	};

	const refresh = async () => {
		await tick();
		draw();
	};

	$: if (mode !== previousMode) {
		activeStageIdx = 0;
		hoveredStageId = null;
		selectedStageId = mode === 'vision' ? cfg.nodes[0]?.id || null : null;
		hoveredRow = null;
		expandedStageId = null;
		previousMode = mode;
		refresh();
	}
	$: speed, density, glow, draw();

	onMount(() => {
		refresh();
		window.addEventListener('resize', draw);
	});
	onDestroy(() => {
		window.removeEventListener('resize', draw);
	});
</script>

<section class="template-wrap" class:vision-mode={mode === 'vision'} bind:this={wrapEl}>
	<div class="template-head">
		<div>
			<div class="kicker">{mode === 'vision' ? 'Vision Model' : 'Summarization Model'}</div>
			<h3>{cfg.title}</h3>
			<p>{cfg.description}</p>
		</div>
		{#if mode === 'vision'}
			<div class="vision-controls">
				<div class="task-select" aria-label="Vision task">
					{#each Object.entries(visionTasks) as [taskId, task]}
						<button
							type="button"
							class:active={visionTask === taskId}
							on:click={() => {
								visionTask = taskId as VisionTask;
								activeStageIdx = Math.max(activeStageIdx, 4);
								setActiveStage(activeStageIdx);
							}}>{task.label}</button
						>
					{/each}
				</div>
				<div class="segmented" aria-label="Architecture view">
					<button
						type="button"
						class:active={visionArchitecture === 'cnn'}
						on:click={() => (visionArchitecture = 'cnn')}>CNN view</button
					>
					<button
						type="button"
						class:active={visionArchitecture === 'vit'}
						on:click={() => (visionArchitecture = 'vit')}>ViT view</button
					>
				</div>
				<label class="step-control"
					>Stage
					<input
						type="range"
						min="0"
						max={cfg.nodes.length - 1}
						step="1"
						bind:value={activeStageIdx}
						on:input={() => setActiveStage(activeStageIdx)}
					/>
					<span>{activeStageIdx + 1}/{cfg.nodes.length}</span>
				</label>
			</div>
		{:else}
			<div class="controls">
				<label>Speed <input type="range" min="0.8" max="3" step="0.1" bind:value={speed} /></label>
				<label>Density <input type="range" min="0.8" max="2" step="0.1" bind:value={density} /></label>
				<label>Glow <input type="range" min="0.1" max="1" step="0.1" bind:value={glow} /></label>
			</div>
		{/if}
	</div>

	{#if mode === 'vision' && activeLesson}
		<div class="vision-guide" style={`--accent:${activeStage.accent}`}>
			<div class="guide-copy">
				<div class="guide-question">{activeLesson.question}</div>
				<p>{activeLesson[visionArchitecture]}</p>
				<div class="recommendation">
					<span>Prompt: {activeTask.prompt}</span>
					<span>Recommended: {activeTask.model}</span>
					<span>Needs: {activeTask.dataset}</span>
					<span>Outputs: {activeTask.output}</span>
				</div>
			</div>
			<div class="stage-pills">
				{#each cfg.nodes as stage, i}
					<button
						type="button"
						class:active={i === activeStageIdx}
						on:click={() => setActiveStage(i)}
						style={`--accent:${stage.accent}`}
					>
						<span>{i + 1}</span>{getStageTitle(stage, activeTask)}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="template-grid" class:vision-grid={mode === 'vision'} style={`--stage-count:${cfg.nodes.length}`}>
		{#each cfg.nodes as stage, stageIdx}
			<div
				class="stage-col"
				class:muted={!isStageActive(stage.id)}
				style={`--accent:${stage.accent};--stage-score:${stageScore(stageIdx)}%;--stage-secondary:${stageSecondaryScore(stageIdx)}%`}
			>
				<button
					type="button"
					class="stage-title"
					class:active={focusStage === stage.id}
					on:mouseenter={() => (hoveredStageId = stage.id)}
					on:mouseleave={() => (hoveredStageId = null)}
					on:click={() =>
						mode === 'vision'
							? setActiveStage(stageIdx)
							: (selectedStageId = selectedStageId === stage.id ? null : stage.id)}
					on:dblclick={() => (expandedStageId = stage.id)}
				>
					{getStageTitle(stage, activeTask)}
				</button>
				<div class="stage-subtitle">{getStageSubtitle(stage, activeTask, visionArchitecture)}</div>

				<button
					type="button"
					class="stage-visual"
					aria-label={`Inspect ${getStageTitle(stage, activeTask)}`}
					on:mouseenter={() => (hoveredStageId = stage.id)}
					on:mouseleave={() => (hoveredStageId = null)}
					on:click={() => (expandedStageId = stage.id)}
				>
					{#if mode === 'vision'}
						{#if stage.id === 'input'}
							<div class="photo-card">
								<div class="fish-body"></div>
								<div class="fish-tail"></div>
								<div class="fish-stripe one"></div>
								<div class="fish-stripe two"></div>
								<div class="subject-box"></div>
								<div class="pixel-zoom">
									<i></i><i></i><i></i><i></i>
								</div>
								<div class="rgb-channels"><i class="r"></i><i class="g"></i><i class="b"></i></div>
								<span>RGB pixels</span>
							</div>
						{:else if stage.id === 'preprocess'}
							<div class="crop-frame">
								<div class="crop-photo"></div>
								<div class="crop-grid"></div>
								<div class="normalize-bars">
									<i></i><i></i><i></i>
								</div>
								<span class="resize-label">raw to 224</span>
							</div>
						{:else if stage.id === 'features'}
							{#if visionArchitecture === 'cnn'}
								<div class="conv-demo">
									<div class="kernel"></div>
									<div class="scan-line"></div>
									<div class="feature-map mini">
										{#each heatCells as cell}
											<i class:hot={(cell + stageIdx) % 5 === 0} class:warm={(cell + stageIdx) % 3 === 0}></i>
										{/each}
									</div>
									<div class="filter-label">filter scan</div>
								</div>
							{:else}
								<div class="patch-demo">
									{#each patchCells as cell}
										<i class:active={cell === 4 || cell === 5}></i>
									{/each}
									<div class="token-row"><span></span><span></span><span></span></div>
								</div>
							{/if}
						{:else if stage.id === 'representation'}
							{#if visionArchitecture === 'cnn'}
								<div class="hierarchy-demo">
									<span>edges</span>
									<i></i>
									<span>textures</span>
									<i></i>
									<span>parts</span>
									<i></i>
									<span>object</span>
								</div>
							{:else}
								<div class="attention-patch-demo">
									{#each patchCells as cell}
										<i class:focus={cell === 4 || cell === 5 || cell === 7}></i>
									{/each}
									<svg viewBox="0 0 100 70" aria-hidden="true">
										<path d="M 28 34 C 42 12, 64 12, 74 34" />
										<path d="M 28 34 C 43 58, 60 58, 73 47" />
										<circle cx="28" cy="34" r="4" />
										<circle cx="74" cy="34" r="4" />
									</svg>
								</div>
							{/if}
						{:else if stage.id === 'classifier'}
							{#if visionTask === 'detection'}
								<div class="detection-demo">
									<div class="box one">fish</div>
									<div class="box two">fish</div>
									<div class="box three">coral</div>
								</div>
							{:else if visionTask === 'segmentation'}
								<div class="mask-demo">
									<div class="mask coral"></div>
									<div class="mask water"></div>
									<div class="mask sand"></div>
								</div>
							{:else if visionTask === 'captioning'}
								<div class="caption-demo">
									{#each activeTask.headVectors as word}
										<span>{word}</span>
									{/each}
								</div>
							{:else}
								<div class="logit-stack">
									{#each getStageVectors(stage, activeTask).slice(0, 4) as label, i}
										<div class="logit-row" class:hot={i === 0}>
											<span>{label}</span>
											<i style={`width:${i === 0 ? 92 : 46 - i * 9}%`}></i>
										</div>
									{/each}
								</div>
							{/if}
						{:else}
							{#if visionTask === 'detection'}
								<div class="detection-output">
									<div class="mini-image">
										<div class="fish-body"></div>
										<div class="fish-tail"></div>
										<div class="detect-box one"></div>
										<div class="detect-box two"></div>
									</div>
									<div class="output-list"><span>fish 94%</span><span>fish 88%</span><span>coral 71%</span></div>
								</div>
							{:else if visionTask === 'segmentation'}
								<div class="segmentation-output">
									<div class="seg-canvas"><i class="water"></i><i class="coral"></i><i class="fish"></i></div>
									<div class="legend"><span>coral</span><span>water</span><span>fish</span></div>
								</div>
							{:else if visionTask === 'captioning'}
								<div class="caption-output">
									<p>A clownfish swims near a coral reef.</p>
									<div class="word-attention"><i></i><i></i><i></i></div>
								</div>
							{:else}
								<div class="explanation-demo">
									<div class="photo-card saliency">
										<div class="fish-body"></div>
										<div class="fish-tail"></div>
										<div class="fish-stripe one"></div>
										<div class="fish-stripe two"></div>
										<div class="heat-spot main"></div>
										<div class="heat-spot fin"></div>
									</div>
									<div class="prediction-donut small">
										<div class="donut-ring"></div>
										<strong>92%</strong>
									</div>
								</div>
							{/if}
						{/if}
					{:else}
						{#if stage.id === 'prompt'}
							<div class="document-lines">
								{#each tokenWidths as width, i}
									<i class:active={hoveredRow === i} style={`width:${width}%`}></i>
								{/each}
							</div>
						{:else if stage.id === 'embed'}
							<div class="token-matrix">
								{#each heatCells as cell}
									<i class:hot={(cell + stageIdx) % 4 === 0}></i>
								{/each}
							</div>
						{:else if stage.id === 'decode'}
							<div class="beam-lanes">
								{#each miniRows as row}
									<i class:active={hoveredRow === row}></i>
								{/each}
							</div>
						{:else if stage.id === 'evaluate'}
							<div class="quality-gates">
								{#each ['facts', 'repeat', 'length'] as gate}
									<span>{gate}</span>
								{/each}
							</div>
						{:else}
							<div class="summary-card">
								{#each summaryWidths as width}
									<i style={`width:${width}%`}></i>
								{/each}
							</div>
						{/if}
					{/if}
				</button>

				<div class="evidence-strip">
					<span>{getStageDetail(stage, activeTask)}</span>
					<i></i>
				</div>

				<div class="column vectors" style={`--glow:${glow}`}>
					{#each getStageVectors(stage, activeTask) as item, rowIdx}
						<div class="cell" class:row-active={hoveredRow === rowIdx}>
							{#if stageIdx === 0}<span class="label float">{item}</span>{/if}
							<button
								type="button"
								class="vector"
								aria-label={`${getStageTitle(stage, activeTask)} ${item}`}
								use:registerVector={{ stageId: stage.id, rowIdx }}
								on:mouseenter={() => (hoveredRow = rowIdx)}
								on:mouseleave={() => (hoveredRow = null)}
							></button>
							{#if stageIdx === cfg.nodes.length - 1}
								<span class="label float-right">{item}</span>
							{/if}
						</div>
					{/each}
				</div>
				<div class="metric">{getStageMetric(stage, activeTask)}</div>
			</div>
		{/each}
	</div>

	{#if mode !== 'vision'}
		<div class="operation-panel">
			<div class="operation-node">
				{#each miniRows as row}
					<i class:active={hoveredRow === row}></i>
				{/each}
			</div>
			<div class="operation-title">{cfg.operationTitle}</div>
			<div class="operation-subtitle">{cfg.operationSubtitle}</div>
			<div class="ops">
				{#each cfg.operationLabels as op, i}
					<div class="op" class:active={hoveredRow === i}>{op}</div>
				{/each}
			</div>
		</div>
	{/if}

	<svg class="overlay back" aria-hidden="true">
		{#each backEdges as edge}
			<path class="edge back" d={edge.d} style={`--opacity:${edge.opacity};--width:${edge.width};--speed:${speed}`} />
		{/each}
	</svg>
	<svg class="overlay top" aria-hidden="true">
		{#each topEdges as edge}
			<path
				class="edge top"
				class:active={edge.active}
				d={edge.d}
				style={`--opacity:${edge.opacity};--width:${edge.width};--speed:${speed};--glow:${glow}`}
			/>
		{/each}
	</svg>

	{#if mode === 'vision'}
		<div class="edge-label-layer" aria-hidden="true">
			{#each topEdges.filter((edge) => edge.label) as edge}
				<div
					class="edge-label"
					class:active={edge.active}
					style={`left:${edge.midX}px;top:${edge.midY}px;--opacity:${edge.opacity}`}
				>
					<b>{edge.labelFrom}</b><i aria-hidden="true"></i><b>{edge.labelTo}</b>
				</div>
			{/each}
		</div>
	{/if}

	{#if expandedStageId}
		{@const expanded = cfg.nodes.find((d) => d.id === expandedStageId)}
		{#if expanded}
			<button
				type="button"
				class="inspect-bg"
				aria-label="Close stage insight"
				on:click={() => (expandedStageId = null)}
			></button>
			<div class="inspect">
				<div class="inspect-top">
					<div>
						<div class="kicker">Stage Insight</div>
						<div class="inspect-title">{getStageTitle(expanded, activeTask)}</div>
						<div class="inspect-sub">{getStageDetail(expanded, activeTask)}</div>
					</div>
					<button type="button" on:click={() => (expandedStageId = null)}>Close</button>
				</div>
				<div class="inspect-diagram" style={`--accent:${expanded.accent}`}>
					<div class="inspect-card">
						<div class="inspect-label">Signal strength</div>
						<div class="inspect-meter"><i></i></div>
					</div>
					<div class="inspect-card">
						<div class="inspect-label">Active evidence</div>
						<div class="inspect-chips">
							{#each getStageVectors(expanded, activeTask).slice(0, 4) as item}
								<span>{item}</span>
							{/each}
						</div>
					</div>
				</div>
				<ul>
					{#each expanded.insights as line}
						<li>{line}</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
</section>

<style lang="scss">
	.template-wrap {
		position: relative;
		height: 100%;
		padding: 0.35rem 0.8rem 0.8rem;
		overflow: hidden;
	}
	.template-head {
		display: flex;
		justify-content: space-between;
		align-items: end;
		margin-bottom: 0.55rem;
		position: relative;
		z-index: 6;
	}
	.kicker {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: theme('colors.gray.500');
	}
	h3 {
		font-size: 1.08rem;
		font-weight: 600;
		color: theme('colors.gray.700');
	}
	p {
		font-size: 0.78rem;
		color: theme('colors.gray.500');
		max-width: 36rem;
	}
	.controls {
		display: flex;
		gap: 0.45rem;
		label {
			font-size: 0.66rem;
			color: theme('colors.gray.500');
			display: flex;
			flex-direction: column;
			border: 1px solid theme('colors.gray.200');
			border-radius: 0.45rem;
			padding: 0.2rem 0.3rem;
			background: white;
		}
		input {
			width: 5rem;
		}
	}
	.vision-controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.task-select {
		display: inline-flex;
		gap: 0.18rem;
		border: 1px solid theme('colors.gray.200');
		border-radius: 0.55rem;
		padding: 0.15rem;
		background: white;
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
		button {
			border-radius: 0.4rem;
			padding: 0.24rem 0.42rem;
			font-size: 0.62rem;
			font-weight: 800;
			color: theme('colors.gray.500');
			&.active {
				color: theme('colors.gray.800');
				background: theme('colors.orange.50');
				box-shadow: inset 0 0 0 1px theme('colors.orange.200');
			}
		}
	}
	.segmented {
		display: inline-flex;
		border: 1px solid theme('colors.gray.200');
		border-radius: 0.55rem;
		padding: 0.15rem;
		background: white;
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
		button {
			border-radius: 0.4rem;
			padding: 0.24rem 0.5rem;
			font-size: 0.68rem;
			font-weight: 700;
			color: theme('colors.gray.500');
			&.active {
				color: theme('colors.gray.800');
				background: theme('colors.indigo.50');
				box-shadow: inset 0 0 0 1px theme('colors.indigo.200');
			}
		}
	}
	.step-control {
		display: grid;
		grid-template-columns: auto 5.6rem auto;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid theme('colors.gray.200');
		border-radius: 0.55rem;
		background: white;
		padding: 0.28rem 0.4rem;
		color: theme('colors.gray.500');
		font-size: 0.66rem;
		font-weight: 700;
		span {
			color: theme('colors.gray.700');
		}
	}
	.vision-guide {
		position: relative;
		z-index: 7;
		display: grid;
		grid-template-columns: minmax(15rem, 0.9fr) minmax(30rem, 1.5fr);
		gap: 0.65rem;
		align-items: stretch;
		margin: 0.2rem 0.5rem 0.6rem;
	}
	.guide-copy {
		border-left: 0.2rem solid var(--accent);
		background: color-mix(in srgb, var(--accent) 5%, white);
		border-radius: 0.5rem;
		padding: 0.45rem 0.6rem;
		min-width: 0;
	}
	.guide-question {
		font-size: 0.72rem;
		font-weight: 800;
		color: theme('colors.gray.800');
	}
	.guide-copy p {
		margin-top: 0.1rem;
		font-size: 0.68rem;
		line-height: 1.25;
		color: theme('colors.gray.600');
	}
	.recommendation {
		display: flex;
		flex-wrap: wrap;
		gap: 0.22rem;
		margin-top: 0.35rem;
	}
	.recommendation span {
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--accent) 20%, white);
		background: white;
		padding: 0.08rem 0.34rem;
		font-size: 0.55rem;
		font-weight: 800;
		color: theme('colors.gray.600');
	}
	.stage-pills {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.28rem;
	}
	.stage-pills button {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.28rem;
		min-width: 0;
		border: 1px solid theme('colors.gray.200');
		border-radius: 0.48rem;
		padding: 0.32rem 0.34rem;
		background: white;
		color: theme('colors.gray.500');
		font-size: 0.58rem;
		font-weight: 800;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.stage-pills button span {
		display: grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: color-mix(in srgb, var(--accent) 12%, white);
		color: var(--accent);
		font-size: 0.55rem;
	}
	.stage-pills button.active {
		border-color: color-mix(in srgb, var(--accent) 38%, white);
		color: theme('colors.gray.800');
		background: color-mix(in srgb, var(--accent) 6%, white);
	}
	.vision-route-guide {
		position: relative;
		z-index: 7;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.55rem;
		margin: -0.12rem 4.2rem 0.28rem 4.9rem;
		padding-left: calc((100% - 2.75rem) / 12);
		padding-right: calc((100% - 2.75rem) / 12);
		pointer-events: none;
	}
	.vision-route-guide span {
		display: inline-flex;
		align-items: center;
		gap: 0.22rem;
		justify-self: center;
		border: 1px solid theme('colors.sky.100');
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
		padding: 0.12rem 0.38rem;
		font-size: 0.52rem;
		font-weight: 900;
		color: theme('colors.gray.500');
		white-space: nowrap;
		opacity: 0.56;
	}
	.vision-route-guide b,
	.edge-label b {
		font: inherit;
	}
	.vision-route-guide i,
	.edge-label i {
		position: relative;
		width: 0.68rem;
		height: 1px;
		background: currentColor;
		opacity: 0.72;
	}
	.vision-route-guide i::after,
	.edge-label i::after {
		content: '';
		position: absolute;
		right: -0.01rem;
		top: 50%;
		width: 0.3rem;
		height: 0.3rem;
		border-right: 1.5px solid currentColor;
		border-top: 1.5px solid currentColor;
		transform: translateY(-50%) rotate(45deg);
	}
	.vision-route-guide span.active {
		color: theme('colors.indigo.700');
		border-color: theme('colors.indigo.200');
		background: theme('colors.indigo.50');
		opacity: 1;
	}
	.template-grid {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--stage-count), minmax(0, 1fr));
		gap: 0.65rem;
		padding: 0.15rem 4.8rem 0.15rem 5.4rem;
		z-index: 4;
	}
	.template-grid.vision-grid {
		padding-left: 4.9rem;
		padding-right: 4.2rem;
		gap: 0.55rem;
	}
	.stage-col {
		display: grid;
		grid-template-rows: auto auto auto auto 1fr auto;
		min-width: 0;
		transition:
			opacity 160ms ease,
			transform 160ms ease;
	}
	.stage-col.muted {
		opacity: 0.38;
	}
	.stage-title {
		border: none;
		background: none;
		text-align: left;
		color: theme('colors.gray.500');
		font-size: 0.74rem;
		text-transform: uppercase;
		font-weight: 600;
		padding: 0;
		width: fit-content;
		cursor: pointer;
	}
	.stage-title.active {
		color: var(--accent);
	}
	.stage-subtitle {
		font-size: 0.86rem;
		font-weight: 600;
		color: theme('colors.gray.700');
		min-height: 1.35rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.stage-visual {
		position: relative;
		height: 5.55rem;
		margin-top: 0.45rem;
		padding: 0;
		border: 1px solid color-mix(in srgb, var(--accent) 22%, white);
		border-radius: 0.5rem;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, white), white 78%),
			white;
		overflow: hidden;
		cursor: zoom-in;
		box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease,
			transform 160ms ease;
	}
	.stage-visual:hover {
		transform: translateY(-1px);
		border-color: color-mix(in srgb, var(--accent) 50%, white);
		box-shadow: 0 12px 28px color-mix(in srgb, var(--accent) 16%, transparent);
	}
	.stage-visual::after {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 52%);
		opacity: 0.55;
		pointer-events: none;
	}
	.photo-card,
	.crop-frame,
	.feature-map,
	.conv-demo,
	.patch-demo,
	.hierarchy-demo,
	.attention-patch-demo,
	.explanation-demo,
	.detection-demo,
	.mask-demo,
	.caption-demo,
	.detection-output,
	.segmentation-output,
	.caption-output,
	.logit-stack,
	.prediction-donut,
	.document-lines,
	.token-matrix,
	.beam-lanes,
	.quality-gates,
	.summary-card {
		position: absolute;
		inset: 0.55rem;
		z-index: 1;
	}
	.photo-card {
		border-radius: 0.35rem;
		background:
			linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(16, 185, 129, 0.14)),
			repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.55) 0 1px, transparent 1px 18px);
	}
	.fish-body {
		position: absolute;
		left: 27%;
		top: 34%;
		width: 45%;
		height: 28%;
		border-radius: 50%;
		background: #f97316;
		box-shadow: inset 0 0 0 0.28rem rgba(255, 255, 255, 0.86);
	}
	.fish-tail {
		position: absolute;
		left: 66%;
		top: 37%;
		width: 0;
		height: 0;
		border-top: 0.7rem solid transparent;
		border-bottom: 0.7rem solid transparent;
		border-left: 1rem solid #f97316;
	}
	.fish-stripe {
		position: absolute;
		top: 34%;
		width: 0.28rem;
		height: 28%;
		background: white;
		border-radius: 99px;
	}
	.fish-stripe.one {
		left: 42%;
	}
	.fish-stripe.two {
		left: 55%;
	}
	.subject-box {
		position: absolute;
		left: 21%;
		top: 26%;
		width: 58%;
		height: 44%;
		border: 1px dashed color-mix(in srgb, var(--accent) 72%, white);
		border-radius: 0.35rem;
	}
	.photo-card span {
		position: absolute;
		right: 0.35rem;
		bottom: 0.25rem;
		font-size: 0.52rem;
		font-weight: 700;
		color: theme('colors.gray.500');
	}
	.pixel-zoom {
		position: absolute;
		left: 0.35rem;
		bottom: 0.35rem;
		display: grid;
		grid-template-columns: repeat(2, 0.34rem);
		gap: 0.06rem;
		padding: 0.12rem;
		border-radius: 0.22rem;
		background: rgba(255, 255, 255, 0.82);
		border: 1px solid rgba(124, 58, 237, 0.15);
	}
	.pixel-zoom i {
		aspect-ratio: 1;
		border-radius: 0.07rem;
		background: #f97316;
	}
	.pixel-zoom i:nth-child(2) {
		background: #22c55e;
	}
	.pixel-zoom i:nth-child(3) {
		background: #38bdf8;
	}
	.pixel-zoom i:nth-child(4) {
		background: #fff7ed;
	}
	.rgb-channels {
		position: absolute;
		right: 0.35rem;
		top: 0.32rem;
		display: flex;
		gap: 0.12rem;
	}
	.rgb-channels i {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
	}
	.rgb-channels .r {
		background: #ef4444;
	}
	.rgb-channels .g {
		background: #22c55e;
	}
	.rgb-channels .b {
		background: #3b82f6;
	}
	.crop-frame {
		border: 1px dashed color-mix(in srgb, var(--accent) 52%, white);
		border-radius: 0.4rem;
	}
	.crop-photo {
		position: absolute;
		inset: 0.65rem 1.3rem 1rem;
		border-radius: 0.35rem;
		background: linear-gradient(135deg, rgba(249, 115, 22, 0.75), rgba(255, 255, 255, 0.9), rgba(14, 165, 233, 0.65));
	}
	.crop-grid {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, transparent 32%, rgba(99, 102, 241, 0.2) 33%, transparent 34%, transparent 66%, rgba(99, 102, 241, 0.2) 67%, transparent 68%),
			linear-gradient(0deg, transparent 32%, rgba(99, 102, 241, 0.2) 33%, transparent 34%, transparent 66%, rgba(99, 102, 241, 0.2) 67%, transparent 68%);
	}
	.normalize-bars {
		position: absolute;
		left: 0.45rem;
		right: 0.45rem;
		bottom: 0.35rem;
		display: flex;
		gap: 0.2rem;
	}
	.normalize-bars i {
		height: 0.28rem;
		flex: 1;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 48%, white);
	}
	.resize-label,
	.filter-label {
		position: absolute;
		left: 0.45rem;
		top: 0.35rem;
		font-size: 0.52rem;
		font-weight: 800;
		color: theme('colors.gray.500');
	}
	.conv-demo {
		background:
			linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(255, 255, 255, 0.85)),
			repeating-linear-gradient(0deg, rgba(14, 165, 233, 0.12) 0 1px, transparent 1px 0.8rem),
			repeating-linear-gradient(90deg, rgba(14, 165, 233, 0.12) 0 1px, transparent 1px 0.8rem);
		border-radius: 0.38rem;
		overflow: hidden;
	}
	.kernel {
		position: absolute;
		left: 0.75rem;
		top: 1.55rem;
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid #0ea5e9;
		border-radius: 0.22rem;
		background: rgba(255, 255, 255, 0.7);
		animation: scanKernel 2.4s ease-in-out infinite;
	}
	.scan-line {
		position: absolute;
		left: 2.7rem;
		top: 0.75rem;
		bottom: 0.75rem;
		width: 1px;
		background: rgba(14, 165, 233, 0.35);
	}
	.feature-map.mini {
		left: auto;
		right: 0.55rem;
		top: 0.8rem;
		bottom: 0.8rem;
		width: 3.6rem;
		inset-inline-start: auto;
	}
	.patch-demo {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.16rem;
		padding-bottom: 1.1rem;
	}
	.patch-demo i {
		border-radius: 0.22rem;
		background: color-mix(in srgb, var(--accent) 12%, white);
		border: 1px solid color-mix(in srgb, var(--accent) 22%, white);
	}
	.patch-demo i.active {
		background: color-mix(in srgb, var(--accent) 42%, white);
	}
	.token-row {
		position: absolute;
		left: 0.55rem;
		right: 0.55rem;
		bottom: 0.4rem;
		display: flex;
		gap: 0.2rem;
	}
	.token-row span {
		flex: 1;
		height: 0.3rem;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 34%, white);
	}
	.hierarchy-demo {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-content: center;
		gap: 0.24rem 0.28rem;
		text-align: center;
	}
	.hierarchy-demo span {
		border-radius: 999px;
		padding: 0.22rem 0.28rem;
		background: color-mix(in srgb, var(--accent) 12%, white);
		border: 1px solid color-mix(in srgb, var(--accent) 24%, white);
		font-size: 0.52rem;
		font-weight: 800;
		color: theme('colors.gray.600');
	}
	.hierarchy-demo i {
		width: 0.62rem;
		height: 1px;
		background: color-mix(in srgb, var(--accent) 48%, white);
		align-self: center;
	}
	.attention-patch-demo {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.18rem;
	}
	.attention-patch-demo i {
		border-radius: 0.2rem;
		background: color-mix(in srgb, var(--accent) 12%, white);
		border: 1px solid color-mix(in srgb, var(--accent) 18%, white);
	}
	.attention-patch-demo i.focus {
		background: color-mix(in srgb, var(--accent) 48%, white);
	}
	.attention-patch-demo svg {
		position: absolute;
		inset: 0.35rem;
		width: calc(100% - 0.7rem);
		height: calc(100% - 0.7rem);
		z-index: 2;
	}
	.attention-patch-demo path {
		fill: none;
		stroke: color-mix(in srgb, var(--accent) 72%, white);
		stroke-width: 2;
		stroke-linecap: round;
		opacity: 0.72;
	}
	.attention-patch-demo circle {
		fill: color-mix(in srgb, var(--accent) 80%, white);
	}
	.explanation-demo {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.45rem;
		align-items: center;
	}
	.explanation-demo .photo-card {
		position: relative;
		inset: auto;
		height: 100%;
	}
	.photo-card.saliency {
		background:
			radial-gradient(circle at 48% 44%, rgba(249, 115, 22, 0.32), transparent 34%),
			linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(16, 185, 129, 0.1));
	}
	.heat-spot {
		position: absolute;
		border-radius: 50%;
		background: rgba(249, 115, 22, 0.48);
		filter: blur(0.45rem);
	}
	.heat-spot.main {
		left: 36%;
		top: 30%;
		width: 2.6rem;
		height: 1.6rem;
	}
	.heat-spot.fin {
		left: 60%;
		top: 42%;
		width: 1.4rem;
		height: 1rem;
	}
	.prediction-donut.small {
		position: relative;
		inset: auto;
		width: 3.8rem;
		height: 3.8rem;
	}
	.detection-demo {
		border-radius: 0.38rem;
		background:
			linear-gradient(135deg, rgba(14, 165, 233, 0.16), rgba(16, 185, 129, 0.1)),
			repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.65) 0 1px, transparent 1px 18px);
	}
	.box {
		position: absolute;
		display: grid;
		place-items: start center;
		border: 2px solid color-mix(in srgb, var(--accent) 78%, white);
		border-radius: 0.24rem;
		padding-top: 0.12rem;
		font-size: 0.48rem;
		font-weight: 900;
		color: theme('colors.gray.700');
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}
	.box.one {
		left: 16%;
		top: 28%;
		width: 36%;
		height: 34%;
	}
	.box.two {
		right: 16%;
		top: 22%;
		width: 25%;
		height: 24%;
		border-color: #f97316;
	}
	.box.three {
		left: 44%;
		bottom: 14%;
		width: 42%;
		height: 22%;
		border-color: #22c55e;
	}
	.mask-demo {
		border-radius: 0.38rem;
		background: linear-gradient(180deg, rgba(14, 165, 233, 0.2), rgba(14, 165, 233, 0.06));
		overflow: hidden;
	}
	.mask {
		position: absolute;
		border-radius: 999px;
		opacity: 0.82;
		filter: blur(0.02rem);
	}
	.mask.coral {
		left: 8%;
		bottom: 10%;
		width: 62%;
		height: 38%;
		background: #fb7185;
		clip-path: polygon(0 80%, 14% 38%, 30% 68%, 46% 20%, 62% 60%, 78% 32%, 100% 82%, 100% 100%, 0 100%);
	}
	.mask.water {
		inset: 0;
		background: rgba(56, 189, 248, 0.26);
	}
	.mask.sand {
		right: 0;
		bottom: 0;
		width: 48%;
		height: 26%;
		background: rgba(251, 191, 36, 0.46);
	}
	.caption-demo,
	.caption-output {
		display: flex;
		flex-wrap: wrap;
		align-content: center;
		gap: 0.28rem;
	}
	.caption-demo span {
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 14%, white);
		border: 1px solid color-mix(in srgb, var(--accent) 24%, white);
		padding: 0.2rem 0.34rem;
		font-size: 0.58rem;
		font-weight: 800;
		color: theme('colors.gray.600');
	}
	.caption-demo span:nth-child(2),
	.caption-demo span:nth-child(5) {
		background: color-mix(in srgb, var(--accent) 34%, white);
	}
	.detection-output {
		display: grid;
		grid-template-columns: 1fr 4.2rem;
		gap: 0.4rem;
		align-items: stretch;
	}
	.mini-image {
		position: relative;
		border-radius: 0.35rem;
		background: linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(16, 185, 129, 0.12));
		overflow: hidden;
	}
	.mini-image .fish-body {
		left: 22%;
		width: 42%;
	}
	.mini-image .fish-tail {
		left: 60%;
	}
	.detect-box {
		position: absolute;
		border: 2px solid #f97316;
		border-radius: 0.22rem;
	}
	.detect-box.one {
		left: 18%;
		top: 28%;
		width: 52%;
		height: 42%;
	}
	.detect-box.two {
		right: 9%;
		bottom: 16%;
		width: 30%;
		height: 26%;
		border-color: #22c55e;
	}
	.output-list {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.24rem;
	}
	.output-list span,
	.legend span {
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 12%, white);
		padding: 0.16rem 0.32rem;
		font-size: 0.5rem;
		font-weight: 900;
		color: theme('colors.gray.600');
	}
	.segmentation-output {
		display: grid;
		grid-template-columns: 1fr 3.6rem;
		gap: 0.42rem;
	}
	.seg-canvas {
		position: relative;
		border-radius: 0.35rem;
		overflow: hidden;
		background: rgba(14, 165, 233, 0.16);
	}
	.seg-canvas i {
		position: absolute;
	}
	.seg-canvas .water {
		inset: 0;
		background: rgba(56, 189, 248, 0.34);
	}
	.seg-canvas .coral {
		left: 5%;
		bottom: 5%;
		width: 72%;
		height: 48%;
		background: rgba(244, 63, 94, 0.72);
		clip-path: polygon(0 90%, 14% 38%, 26% 76%, 42% 18%, 56% 68%, 75% 30%, 100% 82%, 100% 100%, 0 100%);
	}
	.seg-canvas .fish {
		right: 14%;
		top: 24%;
		width: 30%;
		height: 20%;
		border-radius: 50%;
		background: rgba(249, 115, 22, 0.88);
	}
	.legend {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.26rem;
	}
	.caption-output {
		align-content: space-between;
	}
	.caption-output p {
		width: 100%;
		margin: 0;
		padding: 0.5rem 0.55rem;
		border-radius: 0.42rem;
		background: color-mix(in srgb, var(--accent) 9%, white);
		border: 1px solid color-mix(in srgb, var(--accent) 22%, white);
		font-size: 0.68rem;
		font-weight: 800;
		color: theme('colors.gray.700');
	}
	.word-attention {
		display: flex;
		width: 100%;
		gap: 0.25rem;
	}
	.word-attention i {
		height: 0.38rem;
		flex: 1;
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 28%, white);
	}
	.word-attention i:nth-child(2) {
		background: color-mix(in srgb, #f97316 58%, white);
	}
	@keyframes scanKernel {
		0%,
		100% {
			transform: translate(0, 0);
		}
		50% {
			transform: translate(1.1rem, 0.65rem);
		}
	}
	.feature-map,
	.token-matrix {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.22rem;
	}
	.feature-map i,
	.token-matrix i {
		border-radius: 0.22rem;
		background: color-mix(in srgb, var(--accent) 16%, white);
		border: 1px solid color-mix(in srgb, var(--accent) 18%, white);
	}
	.feature-map i.warm,
	.token-matrix i.hot {
		background: color-mix(in srgb, var(--accent) 36%, white);
	}
	.feature-map i.hot {
		background: color-mix(in srgb, #f97316 62%, white);
		box-shadow: 0 0 0.6rem rgba(249, 115, 22, 0.25);
	}
	.logit-stack,
	.document-lines,
	.summary-card {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.42rem;
	}
	.logit-row {
		display: grid;
		grid-template-columns: 2.6rem 1fr;
		align-items: center;
		gap: 0.28rem;
		font-size: 0.54rem;
		font-weight: 700;
		color: theme('colors.gray.500');
	}
	.logit-row i {
		height: 0.42rem;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 32%, white);
	}
	.logit-row.hot {
		color: theme('colors.gray.700');
	}
	.logit-row.hot i {
		background: color-mix(in srgb, var(--accent) 72%, white);
	}
	.prediction-donut {
		display: grid;
		place-items: center;
		text-align: center;
	}
	.donut-ring {
		position: absolute;
		width: 3.7rem;
		height: 3.7rem;
		border-radius: 50%;
		background: conic-gradient(var(--accent) 0 var(--stage-score), color-mix(in srgb, var(--accent) 14%, white) 0);
	}
	.donut-ring::after {
		content: '';
		position: absolute;
		inset: 0.5rem;
		border-radius: 50%;
		background: white;
	}
	.prediction-donut strong {
		position: relative;
		z-index: 1;
	}
	.prediction-donut strong {
		font-size: 1rem;
		color: theme('colors.gray.800');
	}
	.document-lines i,
	.summary-card i {
		height: 0.48rem;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 18%, white);
		border: 1px solid color-mix(in srgb, var(--accent) 18%, white);
	}
	.document-lines i.active,
	.summary-card i:first-child {
		background: color-mix(in srgb, var(--accent) 44%, white);
	}
	.beam-lanes {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
	}
	.beam-lanes i {
		width: 0.46rem;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 24%, white);
	}
	.beam-lanes i:nth-child(1) {
		height: 82%;
	}
	.beam-lanes i:nth-child(2) {
		height: 68%;
	}
	.beam-lanes i:nth-child(3) {
		height: 58%;
	}
	.beam-lanes i:nth-child(4),
	.beam-lanes i:nth-child(5),
	.beam-lanes i:nth-child(6) {
		height: 40%;
		opacity: 0.55;
	}
	.beam-lanes i.active {
		background: color-mix(in srgb, var(--accent) 62%, white);
		opacity: 1;
	}
	.quality-gates {
		display: grid;
		place-content: center;
		gap: 0.34rem;
	}
	.quality-gates span {
		min-width: 4rem;
		padding: 0.25rem 0.45rem;
		border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 14%, white);
		border: 1px solid color-mix(in srgb, var(--accent) 28%, white);
		color: theme('colors.gray.600');
		font-size: 0.56rem;
		font-weight: 700;
		text-align: center;
	}
	.evidence-strip {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.34rem;
		min-width: 0;
	}
	.evidence-strip span {
		font-size: 0.58rem;
		font-weight: 700;
		color: theme('colors.gray.500');
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.evidence-strip i {
		height: 0.22rem;
		border-radius: 99px;
		background:
			linear-gradient(90deg, var(--accent) var(--stage-score), transparent var(--stage-score)),
			color-mix(in srgb, var(--accent) 12%, white);
	}
	.vision-mode .evidence-strip {
		display: block;
		margin-top: 0.34rem;
	}
	.vision-mode .evidence-strip span {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		border: 1px solid color-mix(in srgb, var(--accent) 18%, white);
		border-radius: 999px;
		background: color-mix(in srgb, var(--accent) 6%, white);
		padding: 0.1rem 0.38rem;
		color: theme('colors.gray.600');
	}
	.vision-mode .evidence-strip i {
		display: none;
	}
	.vectors {
		margin-top: 0.42rem;
		display: flex;
		flex-direction: column;
		gap: 0.32rem;
	}
	.cell {
		position: relative;
		height: 0.95rem;
		display: flex;
		align-items: center;
	}
	.cell.row-active .vector {
		transform: scaleX(1.35);
		background: color-mix(in srgb, var(--accent) 58%, white);
	}
	.vector {
		width: 13px;
		height: 100%;
		border-radius: 3px;
		background: color-mix(in srgb, var(--accent) 32%, white);
		border: 1px solid color-mix(in srgb, var(--accent) 65%, white);
		box-shadow: 0 0 calc(10px * var(--glow)) color-mix(in srgb, var(--accent) 25%, transparent);
		transition: transform 120ms ease;
		cursor: pointer;
	}
	.label {
		font-size: 0.72rem;
		line-height: 0.95rem;
		height: 0.95rem;
		max-width: 4.8rem;
		color: theme('colors.gray.700');
	}
	.label.float {
		left: -0.55rem;
	}
	.label.float-right {
		left: 1.05rem;
		text-align: left;
	}
	.metric {
		margin-top: 0.35rem;
		font-size: 0.72rem;
		font-weight: 600;
		color: theme('colors.gray.500');
	}
	.operation-panel {
		position: absolute;
		left: 50%;
		top: 63%;
		transform: translate(-50%, -50%);
		z-index: 5;
		border: 1px solid theme('colors.gray.200');
		background: rgba(255, 255, 255, 0.94);
		border-radius: 0.6rem;
		padding: 0.52rem;
		width: 11rem;
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
	}
	.operation-node {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 0.18rem;
		margin-bottom: 0.4rem;
	}
	.operation-node i {
		aspect-ratio: 1;
		border-radius: 50%;
		background: theme('colors.indigo.100');
		border: 1px solid theme('colors.indigo.200');
	}
	.operation-node i.active {
		background: theme('colors.indigo.500');
		box-shadow: 0 0 0.65rem rgba(99, 102, 241, 0.45);
	}
	.operation-title {
		font-size: 0.7rem;
		font-weight: 600;
		color: theme('colors.gray.700');
	}
	.operation-subtitle {
		font-size: 0.62rem;
		color: theme('colors.gray.500');
		margin-bottom: 0.2rem;
	}
	.ops {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
	}
	.op {
		font-size: 0.6rem;
		background: theme('colors.indigo.50');
		color: theme('colors.indigo.600');
		border: 1px solid theme('colors.indigo.100');
		border-radius: 999px;
		padding: 0.08rem 0.35rem;
		opacity: 0.6;
	}
	.op.active {
		opacity: 1;
	}
	.overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.overlay.back {
		z-index: 0;
	}
	.overlay.top {
		z-index: 3;
	}
	.edge {
		fill: none;
		stroke-linecap: round;
		stroke-opacity: var(--opacity);
		stroke-width: calc(var(--width) * 1px);
	}
	.edge.back {
		stroke: theme('colors.slate.300');
		stroke-dasharray: 2 8;
	}
	.edge.top {
		stroke: theme('colors.indigo.400');
		stroke-dasharray: 5 8;
		animation: dash calc(2.2s / var(--speed)) linear infinite;
		filter: drop-shadow(0 0 calc(8px * var(--glow)) rgba(99, 102, 241, 0.35));
	}
	.edge.top.active {
		stroke: theme('colors.indigo.500');
	}
	.vision-mode .edge.back {
		stroke: theme('colors.slate.200');
		stroke-dasharray: none;
	}
	.vision-mode .edge.top {
		stroke: theme('colors.sky.400');
		stroke-dasharray: none;
		filter: drop-shadow(0 0 calc(6px * var(--glow)) rgba(14, 165, 233, 0.18));
	}
	.vision-mode .edge.top.active {
		stroke: theme('colors.indigo.500');
	}
	.edge-label-layer {
		position: absolute;
		inset: 0;
		z-index: 5;
		pointer-events: none;
	}
	.edge-label {
		position: absolute;
		display: inline-flex;
		align-items: center;
		gap: 0.22rem;
		transform: translate(-50%, -50%);
		border: 1px solid theme('colors.indigo.100');
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
		padding: 0.12rem 0.38rem;
		font-size: 0.54rem;
		font-weight: 900;
		color: theme('colors.gray.600');
		opacity: max(var(--opacity), 0.36);
		white-space: nowrap;
	}
	.edge-label.active {
		color: theme('colors.indigo.700');
		border-color: theme('colors.indigo.200');
		background: theme('colors.indigo.50');
	}
	@keyframes dash {
		to {
			stroke-dashoffset: -22;
		}
	}
	.inspect-bg {
		position: absolute;
		inset: 0;
		background: rgba(17, 24, 39, 0.18);
		z-index: 15;
	}
	.inspect {
		position: absolute;
		right: 1rem;
		top: 1rem;
		width: 23rem;
		max-width: calc(100% - 2rem);
		background: white;
		border: 1px solid theme('colors.gray.200');
		border-radius: 0.75rem;
		padding: 0.8rem;
		z-index: 16;
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
	}
	.inspect-top {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		button {
			border: 1px solid theme('colors.gray.300');
			border-radius: 0.45rem;
			padding: 0.25rem 0.5rem;
			font-size: 0.72rem;
			color: theme('colors.gray.600');
		}
	}
	.inspect-title {
		font-size: 0.98rem;
		font-weight: 700;
		color: theme('colors.gray.800');
	}
	.inspect-sub {
		font-size: 0.78rem;
		color: theme('colors.gray.500');
	}
	.inspect-diagram {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem;
		margin-top: 0.7rem;
	}
	.inspect-card {
		border: 1px solid color-mix(in srgb, var(--accent) 22%, white);
		border-radius: 0.55rem;
		padding: 0.55rem;
		background: color-mix(in srgb, var(--accent) 5%, white);
	}
	.inspect-label {
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 700;
		color: theme('colors.gray.500');
	}
	.inspect-meter {
		height: 0.48rem;
		border-radius: 99px;
		margin-top: 0.45rem;
		background: white;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--accent) 16%, white);
	}
	.inspect-meter i {
		display: block;
		width: 76%;
		height: 100%;
		background: var(--accent);
		border-radius: inherit;
	}
	.inspect-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.38rem;
	}
	.inspect-chips span {
		border-radius: 999px;
		padding: 0.1rem 0.38rem;
		background: white;
		border: 1px solid color-mix(in srgb, var(--accent) 20%, white);
		color: theme('colors.gray.600');
		font-size: 0.62rem;
		font-weight: 700;
	}
	.inspect ul {
		padding-left: 1rem;
		margin-top: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.inspect li {
		font-size: 0.77rem;
		color: theme('colors.gray.600');
	}
</style>
