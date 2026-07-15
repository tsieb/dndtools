(function () {
	try {
		var DARK = { tavern: 1, 'high-contrast': 1 };
		var NAMED = { tavern: 1, parchment: 1, 'high-contrast': 1 };
		var pref = null;
		try {
			pref = window.localStorage.getItem('dndtools:react:theme');
		} catch {
			pref = null;
		}
		// The hero theme is tavern. Honor a saved preference, but keep the
		// application default stable regardless of the operating-system theme.
		var applied = NAMED[pref] ? pref : 'tavern';
		var root = document.documentElement;
		root.setAttribute('data-theme', applied);
		root.style.colorScheme = DARK[applied] ? 'dark' : 'light';
	} catch {
		// The document already declares tavern, so a storage failure is harmless.
	}
})();

(function () {
	try {
		var pref = null;
		try {
			pref = window.localStorage.getItem('dndtools:react:motion');
		} catch {
			pref = null;
		}
		var osReduce =
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		document.documentElement.setAttribute(
			'data-motion',
			pref === 'reduced' || osReduce ? 'reduced' : 'full',
		);
	} catch {
		// CSS defaults remain usable.
	}
})();

(function () {
	try {
		var width = window.innerWidth;
		var viewportClass = width <= 720 ? 'compact' : width >= 1200 ? 'expanded' : 'medium';
		var pref = null;
		try {
			pref = window.localStorage.getItem('dndtools:react:density');
		} catch {
			pref = null;
		}
		var allowed = { standard: 1, compact: 1, comfortable: 1 };
		var desktop = allowed[pref] ? pref : 'standard';
		document.documentElement.setAttribute(
			'data-density',
			viewportClass === 'expanded' ? desktop : 'comfortable',
		);
	} catch {
		// CSS defaults remain usable.
	}
})();
