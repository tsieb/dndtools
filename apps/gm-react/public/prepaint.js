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
		// An EXPLICIT stored preference wins over the OS hint, in both directions. This used to be
		// `pref === 'reduced' || osReduce`, which discarded a stored 'full' on every reload: a user
		// whose OS asks for reduced motion could turn the Settings switch off, watch it work for the
		// session, and find it back ON next launch — a control that lied about its own state. With no
		// stored value (`pref === null`) the OS still decides, so the default is unchanged.
		var motion =
			pref === 'reduced' ? 'reduced' : pref === 'full' ? 'full' : osReduce ? 'reduced' : 'full';
		document.documentElement.setAttribute('data-motion', motion);
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
