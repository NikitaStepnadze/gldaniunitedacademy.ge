/*
 * Scroll-driven frame sequence for the "რატომ ჩვენ" benefit circle.
 *
 * A 96-frame WebP sequence of a ball hitting the net plays inside the circular
 * aperture that used to hold a still photo.
 *
 * NOTHING ON THE PAGE MOVES WHILE IT PLAYS -- only the frames change.
 *
 * The usual way to build this is a sticky element inside an over-tall track, so
 * the page keeps scrolling "underneath" a section that appears to hold. That was
 * the earlier implementation here and it is wrong for this design: the track's
 * surplus height is real layout, so it pushes the neighbouring sections apart
 * and they visibly slide while the film plays.
 *
 * Instead the section is a normal block in the flow, and when it reaches the
 * middle of the viewport the page is held: scroll input is captured and spent
 * advancing frames rather than moving the document. When the sequence reaches
 * either end, the hold releases and the input goes back to the page. The scroll
 * position never changes during the hold, so neither do the sections around it.
 *
 * The hold is deliberately escapable, because a page that traps scrolling is
 * hostile:
 *   - it only ever engages once per direction, and only from a near-standstill
 *   - any keyboard paging key, or a second firm gesture, releases immediately
 *   - it never engages for reduced-motion or below the mobile breakpoint
 *   - it is capped in time, so a stuck state cannot outlast MAX_HOLD_MS
 *
 * The four benefit texts are NOT animated: they are readable as soon as the
 * section is on screen and stay that way. Only the film responds to scroll.
 *
 * Frame handling still follows the animated-website skill's starter: critical
 * frames first then batched streaming, nearest-loaded-frame fallback, LERP
 * smoothing toward the target frame, DPR capped at 2, loop paused when hidden.
 */
(function () {
	'use strict';

	var FRAME_COUNT = 96;
	var FRAME_PAD = 4;
	// Higher than the skill's 0.11 default: the frames now map straight from
	// scroll with no dwell easing, so the smoothing is only there to take the
	// step out of a fast wheel tick, not to slow the playback down.
	var LERP_FACTOR = 0.2;
	// Wheel/touch pixels needed to play the sequence end to end. Lower is faster.
	var SCRUB_PIXELS = 900;
	// How close to centred the section must be before the hold engages, and the
	// hard ceiling on how long a hold may last.
	var CENTER_TOLERANCE = 90;
	var MAX_HOLD_MS = 9000;
	var MOBILE_QUERY = '(max-width: 991px)';
	var REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
	var BASE = '/images/benefit-sequence';

	var track = document.getElementById('benefit-scroll-track');
	var canvas = document.getElementById('benefit-sequence-canvas');
	if (!track || !canvas) return;

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

	// Sequence position, 0..1. Advanced only by scroll input captured during a
	// hold -- never by the document's own scroll position.
	var progress = 0;
	var holding = false;
	var holdStarted = 0;
	var lockedScrollY = 0;
	var released = false;
	var touchY = 0;

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
	 * How far the section's centre is from the viewport's centre. The hold engages
	 * when this is small, so the film starts from a composed, centred frame rather
	 * than from wherever the section happened to be.
	 */
	function centerOffset() {
		var rect = track.getBoundingClientRect();
		return (rect.top + rect.height / 2) - window.innerHeight / 2;
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

	/* --- the hold --------------------------------------------------------- */

	/*
	 * `progress` is the sequence position, 0..1. It is advanced by scroll input
	 * that has been taken away from the page, never by the page's own position --
	 * which is the whole point: the document does not move, so nothing around the
	 * section moves either.
	 */
	function consume(delta) {
		var before = progress;
		progress = Math.max(0, Math.min(1, progress + delta / SCRUB_PIXELS));
		return progress !== before;
	}

	/*
	 * The hold engages when the section is near centred, is being entered from the
	 * side the sequence can still play toward, and has not just been released.
	 */
	function shouldHold(delta) {
		if (holding || reducedMotion || useMobile || released) return false;
		if (Math.abs(centerOffset()) > CENTER_TOLERANCE) return false;
		if (delta > 0 && progress >= 1) return false;
		if (delta < 0 && progress <= 0) return false;
		return true;
	}

	function beginHold() {
		holding = true;
		holdStarted = now();
		lockedScrollY = window.pageYOffset;
	}

	function endHold() {
		holding = false;
		/*
		 * `released` latches until the section leaves the centre band, so a hold
		 * that has just finished cannot immediately re-engage and trap the reader
		 * at the same spot.
		 */
		released = true;
	}

	function now() {
		return (window.performance && window.performance.now)
			? window.performance.now()
			: Date.now();
	}

	/*
	 * Wheel and touch handlers are the only places scrolling is intercepted, and
	 * only while `holding`. Both are registered non-passive so preventDefault is
	 * allowed; everywhere else the listeners are passive.
	 */
	function onWheel(event) {
		var delta = event.deltaY;
		if (!delta) return;

		if (shouldHold(delta)) beginHold();
		if (!holding) return;

		// A hold that runs too long, or that cannot advance any further, gives the
		// page back rather than swallowing the gesture.
		if (now() - holdStarted > MAX_HOLD_MS) { endHold(); return; }
		if (!consume(delta)) { endHold(); return; }

		event.preventDefault();
		window.scrollTo(0, lockedScrollY);
	}

	function onTouchStart(event) {
		touchY = event.touches[0].clientY;
	}

	function onTouchMove(event) {
		var y = event.touches[0].clientY;
		var delta = touchY - y;
		touchY = y;
		if (!delta) return;

		if (shouldHold(delta)) beginHold();
		if (!holding) return;

		if (now() - holdStarted > MAX_HOLD_MS) { endHold(); return; }
		if (!consume(delta * 1.6)) { endHold(); return; }

		event.preventDefault();
		window.scrollTo(0, lockedScrollY);
	}

	// Any explicit paging/navigation key releases the hold immediately: the reader
	// has asked the page to move, and that request outranks the animation.
	function onKeyDown() {
		if (holding) endHold();
	}

	function tick() {
		if (!running) return;

		/*
		 * Below the breakpoint there is no hold -- trapping scroll on a touch device
		 * is far more intrusive than on a desktop, and the stacked layout has no
		 * centred composition to hold anyway. The sequence plays off the section's
		 * own travel through the viewport instead, so it still animates while the
		 * page scrolls normally past it.
		 */
		if (useMobile) {
			var r = track.getBoundingClientRect();
			var span = r.height + window.innerHeight;
			progress = Math.max(0, Math.min(1, (window.innerHeight - r.top) / span));
		}

		// Re-arm once the section is clear of the centre band, so the hold can play
		// again on a later pass rather than only ever running once.
		if (released && Math.abs(centerOffset()) > CENTER_TOLERANCE * 2) {
			released = false;
		}

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
			drawFrame(nearestLoaded(0));
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

	/*
	 * These two are the only non-passive listeners on the page, and they only ever
	 * call preventDefault while a hold is actually in progress. Outside a hold they
	 * return immediately and scrolling behaves completely normally.
	 */
	if (!reducedMotion) {
		window.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('touchstart', onTouchStart, { passive: true });
		window.addEventListener('touchmove', onTouchMove, { passive: false });
		window.addEventListener('keydown', onKeyDown, { passive: true });
	}

	revealAll();

	init();
})();
