/*
 * Scroll-driven frame sequence for the "რატომ ჩვენ" benefit circle.
 *
 * A 96-frame WebP sequence of a ball hitting the net plays inside the circular
 * aperture that used to hold a still photo.
 *
 * THE SECTION IS PINNED BY NATIVE STICKY POSITIONING -- see custom.css.
 *
 * The flow: the page scrolls down normally; when the section arrives it stops
 * moving on screen; the scroll that follows plays the film; when the film is
 * done the section releases and the page scrolls on normally.
 *
 * An earlier version implemented that by locking the page from script -- letting
 * the browser scroll, then snapping it back with scrollTo on every wheel event.
 * It shook, badly, and it always will: the browser's smooth-scroll animation is
 * already in flight when the handler runs, so every correction is a visible
 * jump, and momentum scrolling on a trackpad fires dozens of them a second.
 *
 * This file therefore intercepts NOTHING. No wheel handler, no touch handler,
 * no preventDefault, no scrollTo. `.benefit-scroll-stage` is exactly as tall as
 * the section itself and sticks inside a taller `.benefit-scroll-track`, so the
 * browser itself holds the section still, on the compositor, with no per-frame
 * correction to shake. All this script does is read how far through the track the
 * has scrolled and draw the matching frame. Wheel, trackpad, keyboard,
 * scrollbar, browser find and reload-at-position all behave normally, and the
 * position is a pure function of scrollY -- so scrubbing back up retraces the
 * film exactly, which the old captured-input model could not do.
 *
 * The pin is dropped below the mobile breakpoint and under reduced-motion (both
 * in CSS); in those cases progress comes from the section's own travel through
 * the viewport, or from a single held frame, and no scroll distance is added.
 *
 * The four benefit texts are NOT animated: they are readable as soon as the
 * section is on screen and stay that way. Only the film responds to scroll.
 *
 * Frame handling follows the animated-website skill's starter: critical frames
 * first then batched streaming, nearest-loaded-frame fallback, LERP smoothing
 * toward the target frame, DPR capped at 2, loop paused when hidden.
 */
(function () {
	'use strict';

	var FRAME_COUNT = 96;
	var FRAME_PAD = 4;
	// Smoothing toward the frame the scroll position asks for. The mapping is
	// already continuous, so this only takes the step out of a coarse wheel
	// tick -- it must stay high enough that the film never lags behind the
	// scrollbar, which would read as the pin drifting.
	var LERP_FACTOR = 0.22;
	/*
	 * Scroll distance the sequence plays across, as a multiple of the viewport
	 * height. MUST match `.benefit-scroll-track { height: (100 + SCRUB_VH)vh }`
	 * in custom.css: the track is one viewport for the stage itself plus this
	 * much surplus for the scrub. Read from the actual laid-out track instead of
	 * trusting the constant, so the two can never silently disagree -- this is
	 * only the fallback when the track has no measurable surplus.
	 */
	var SCRUB_VH = 1.5;
	var MOBILE_QUERY = '(max-width: 991px)';
	var REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
	var BASE = '/images/benefit-sequence';

	var track = document.getElementById('benefit-scroll-track');
	var canvas = document.getElementById('benefit-sequence-canvas');
	if (!track || !canvas) return;

	var stage = track.querySelector('.benefit-scroll-stage');
	var circle = document.getElementById('benefit-sequence');
	var ctx = canvas.getContext('2d', { alpha: false });
	var items = Array.prototype.slice.call(
		track.querySelectorAll('[data-benefit-step]')
	);

	var reducedMotion = window.matchMedia(REDUCED_QUERY).matches;
	var mobileMedia = window.matchMedia(MOBILE_QUERY);

	// Kept only to decide which frames to preload first -- the four points the
	// sequence passes through. Nothing is timed to them: the benefit copy is
	// static, so the playback maps straight from scroll with no dwell easing.
	var KEY_POINTS = items.map(function (item) {
		return Number(item.dataset.benefitStep);
	});

	var stores = {
		desktop: createStore(BASE + '/desktop'),
		mobile: createStore(BASE + '/mobile')
	};

	var useMobile = mobileMedia.matches;
	var store = useMobile ? stores.mobile : stores.desktop;
	var currentFrame = 0;
	var lastDrawn = -1;
	var running = false;
	var rafId = 0;
	var progress = 0;

	function createStore(directory) {
		return {
			directory: directory,
			images: new Array(FRAME_COUNT),
			loaded: new Uint8Array(FRAME_COUNT),
			promises: new Array(FRAME_COUNT)
		};
	}

	function frameUrl(index, target) {
		var n = String(index + 1);
		while (n.length < FRAME_PAD) n = '0' + n;
		return target.directory + '/frame-' + n + '.webp';
	}

	function loadFrame(index, target) {
		target = target || store;
		if (target.loaded[index]) return Promise.resolve(target.images[index]);
		if (target.promises[index]) return target.promises[index];

		target.promises[index] = new Promise(function (resolve) {
			var image = new Image();
			target.images[index] = image;
			image.decoding = 'async';
			image.onload = function () {
				target.loaded[index] = 1;
				resolve(image);
			};
			image.onerror = function () {
				target.images[index] = null;
				target.promises[index] = null;
				resolve(null);
			};
			image.src = frameUrl(index, target);
		});
		return target.promises[index];
	}

	function loadInBatches(indices, size, target) {
		var start = 0;
		function next() {
			if (start >= indices.length) return Promise.resolve();
			var batch = indices.slice(start, start + size);
			start += size;
			return Promise.all(
				batch.map(function (index) {
					return loadFrame(index, target);
				})
			).then(next);
		}
		return next();
	}

	/* Nearest already-decoded frame, so a gap in the stream never blanks the
	   canvas -- it holds the closest frame it has until the real one arrives. */
	function nearestLoaded(index) {
		if (store.loaded[index]) return index;
		for (var d = 1; d < FRAME_COUNT; d += 1) {
			if (index - d >= 0 && store.loaded[index - d]) return index - d;
			if (index + d < FRAME_COUNT && store.loaded[index + d]) return index + d;
		}
		return -1;
	}

	/*
	 * Backing store is sized from the laid-out box, capped at 2x DPR. clientWidth
	 * includes the ring border, which is not drawable area, so the drawable box
	 * comes from getBoundingClientRect minus the border -- using clientWidth here
	 * sized the buffer smaller than the CSS box and left the frames soft.
	 */
	function resizeCanvas() {
		var dpr = Math.min(window.devicePixelRatio || 1, 2);
		var style = window.getComputedStyle(canvas);
		var border = parseFloat(style.borderLeftWidth) || 0;
		var box = canvas.getBoundingClientRect().width - border * 2;
		var size = Math.round(box * dpr);
		if (size > 0 && canvas.width !== size) {
			canvas.width = size;
			canvas.height = size;
			lastDrawn = -1;
			drawFrame(Math.round(currentFrame));
		}
	}

	/*
	 * Publishes the stage's real height to CSS as --stage-h.
	 *
	 * The sticky `top` that centres the section needs the section's own height, and
	 * CSS cannot refer to an element's height in its own `top`. The stylesheet
	 * carries a sensible default so the layout is correct before this runs and if
	 * scripting is off; this replaces it with the measured value, and keeps it in
	 * step as the box changes (fonts landing, resize, the theme's scripts settling).
	 */
	function syncStageHeight() {
		if (!stage) return;
		var h = stage.offsetHeight;
		if (h > 0) track.style.setProperty('--stage-h', h + 'px');
	}

	/* Frames are square and the canvas is square, so a cover fit is a straight
	   fill; the branch still guards against a non-square frame set. */
	function drawFrame(index) {
		var clamped = Math.max(0, Math.min(FRAME_COUNT - 1, index));
		var resolved = nearestLoaded(clamped);
		if (resolved < 0 || resolved === lastDrawn) return;

		var image = store.images[resolved];
		if (!image || !image.naturalWidth) return;

		var size = canvas.width;
		ctx.fillStyle = '#0b1017';
		ctx.fillRect(0, 0, size, size);

		var scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
		var w = image.naturalWidth * scale;
		var h = image.naturalHeight * scale;
		ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
		lastDrawn = resolved;
	}

	/* --- reveals ---------------------------------------------------------- */

	/*
	 * The four benefits are static: they are readable from the moment the section
	 * is on screen and never animate in or out. Only the film scrubs with scroll.
	 */
	function revealAll() {
		for (var i = 0; i < items.length; i += 1) {
			items[i].classList.add('is-revealed');
		}
	}

	/* --- scroll mapping --------------------------------------------------- */

	/*
	 * Sequence position, 0..1, as a pure function of where the document is.
	 *
	 * `travelled` is how far the stage has slid down inside the track, which is 0
	 * while the section is still scrolling up into place and grows only once the
	 * pin has engaged.
	 *
	 * Both ends need care, and getting either wrong is visible:
	 *
	 *  - The stage sticks at `top` px from the viewport top, so the pin does not
	 *    engage until the stage has ALREADY travelled `top` px into the track.
	 *    Measuring from 0 therefore started the film at ~9% -- the first frames
	 *    never played. The offset is subtracted from both terms instead.
	 *  - The pin ends when the stage reaches the bottom of the track, i.e. after
	 *    `surplus` px of travel. So the usable range is `surplus - top`, not
	 *    `surplus`; using the latter hit the last frame early and then sat on it.
	 *
	 * Everything is measured from the live layout, so this holds at any viewport
	 * size and however the CSS heights change.
	 */
	function pinnedProgress() {
		var offset = parseFloat(window.getComputedStyle(stage).top) || 0;
		var surplus = track.offsetHeight - stage.offsetHeight;
		if (surplus <= 0) surplus = window.innerHeight * SCRUB_VH;

		var range = surplus - offset;
		if (range <= 0) range = surplus;

		var travelled = stage.getBoundingClientRect().top
			- track.getBoundingClientRect().top
			- offset;
		return clamp01(travelled / range);
	}

	/*
	 * Unpinned fallback (mobile, and any case where the pin is off): there is no
	 * hold, so the film plays off the section's own travel through the viewport
	 * as the page scrolls past it normally.
	 */
	function travelProgress() {
		var rect = track.getBoundingClientRect();
		var span = rect.height + window.innerHeight;
		return clamp01((window.innerHeight - rect.top) / span);
	}

	function clamp01(value) {
		return value < 0 ? 0 : (value > 1 ? 1 : value);
	}

	function tick() {
		if (!running) return;

		progress = useMobile ? travelProgress() : pinnedProgress();

		currentFrame += (progress * (FRAME_COUNT - 1) - currentFrame) * LERP_FACTOR;
		drawFrame(Math.round(currentFrame));
		circle.style.setProperty('--benefit-progress', progress.toFixed(4));

		rafId = window.requestAnimationFrame(tick);
	}

	function start() {
		if (running) return;
		running = true;
		rafId = window.requestAnimationFrame(tick);
	}

	function stop() {
		running = false;
		window.cancelAnimationFrame(rafId);
	}

	/* --- init ------------------------------------------------------------- */

	function init() {
		resizeCanvas();
		syncStageHeight();

		if (reducedMotion) {
			// One held frame: the ball at the deepest point of the net.
			var poster = Math.round(0.45 * (FRAME_COUNT - 1));
			loadFrame(poster).then(function (image) {
				if (!image) return;
				drawFrame(poster);
				circle.classList.add('is-ready');
			});
			return;
		}

		var critical = [0];
		for (var c = 0; c < KEY_POINTS.length; c += 1) {
			critical.push(Math.round(KEY_POINTS[c] * (FRAME_COUNT - 1)));
		}
		critical.push(FRAME_COUNT - 1);
		critical = critical
			.filter(function (v, i, a) { return a.indexOf(v) === i; })
			.sort(function (a, b) { return a - b; });

		loadFrame(0).then(function (first) {
			if (first) {
				drawFrame(0);
				circle.classList.add('is-ready');
			}
			return Promise.all(
				critical.map(function (index) { return loadFrame(index); })
			);
		}).then(function () {
			if (nearestLoaded(0) < 0) return;

			/*
			 * Seed from the current scroll position before the first paint of the
			 * loop. On a reload partway down the page, or on a hash link into the
			 * section, the pin may already be engaged -- starting from frame 0 there
			 * would snap forward on the first tick.
			 */
			progress = useMobile ? travelProgress() : pinnedProgress();
			currentFrame = progress * (FRAME_COUNT - 1);
			drawFrame(Math.round(currentFrame));

			observe();

			var remaining = [];
			for (var i = 0; i < FRAME_COUNT; i += 1) {
				if (critical.indexOf(i) === -1) remaining.push(i);
			}
			loadInBatches(remaining, 8, store);
		});
	}

	/*
	 * The rAF loop only runs while the section is on screen. Everywhere else on
	 * a 14-page site this would otherwise be a permanent frame loop doing
	 * nothing.
	 */
	function observe() {
		if (!('IntersectionObserver' in window)) {
			start();
			return;
		}
		var observer = new IntersectionObserver(function (entries) {
			if (entries[0].isIntersecting) start();
			else stop();
		}, { rootMargin: '120px 0px' });
		observer.observe(track);
	}

	function swapFrameSet(event) {
		useMobile = event.matches;
		store = useMobile ? stores.mobile : stores.desktop;
		lastDrawn = -1;
		resizeCanvas();

		var frame = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(currentFrame)));
		loadFrame(frame, store).then(function (image) {
			if (!image) return;
			drawFrame(frame);

			var byDistance = [];
			for (var i = 0; i < FRAME_COUNT; i += 1) byDistance.push(i);
			byDistance.sort(function (a, b) {
				return Math.abs(a - frame) - Math.abs(b - frame);
			});
			loadInBatches(byDistance, 8, store);
		});
	}

	window.addEventListener('resize', function () {
		resizeCanvas();
		syncStageHeight();
	}, { passive: true });

	/*
	 * The circle is sized with clamp() against vh and vw, so its box can change
	 * without a resize event -- fonts finishing, scrollbars appearing, the theme's
	 * own scripts settling the layout. Watching the element keeps the backing
	 * store matched to the box in those cases.
	 */
	if ('ResizeObserver' in window) {
		new ResizeObserver(function () {
			resizeCanvas();
		}).observe(canvas);

		/* The stage's height sets both the centring offset and the scrub range, so
		   it has to be re-read whenever the section reflows, not just on resize. */
		if (stage) {
			new ResizeObserver(function () {
				syncStageHeight();
			}).observe(stage);
		}
	}

	if (mobileMedia.addEventListener) {
		mobileMedia.addEventListener('change', swapFrameSet);
	} else if (mobileMedia.addListener) {
		mobileMedia.addListener(swapFrameSet);
	}

	document.addEventListener('visibilitychange', function () {
		if (document.hidden) stop();
		else if (!reducedMotion) start();
	});

	revealAll();

	init();
})();
