import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** The persisted preference is deliberately app-owned, rather than a browser setting: a GM can
 * share a device and needs the chosen language to survive relaunches and native shells. */
export const LOCALE_STORAGE_KEY = 'dndtools:locale';

export const SUPPORTED_LOCALES = [
	{ code: 'en', label: 'English', nativeLabel: 'English' },
	{ code: 'es', label: 'Spanish', nativeLabel: 'Español' },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]['code'];
type MessageValues = Record<string, string | number | Date>;

// English is the source locale. Keys are source strings so legacy JSX, toast calls, and externally
// supplied error text can all be localized by the DOM bridge while new code can use `t()` directly.
// Keep this catalog intentionally flat: translators can work in a single file and plural/date
// formatting remains available through the public helpers below.
export const MESSAGES: Record<SupportedLocale, Record<string, string>> = {
	en: {},
	es: {
		'Language & region': 'Idioma y región',
		Language: 'Idioma',
		'Choose the language used throughout DND Tools. Your choice is saved on this device.':
			'Elige el idioma que se usa en DND Tools. Tu elección se guarda en este dispositivo.',
		'Language changes apply immediately, including menus, dialogs, tooltips, and screen-reader labels.':
			'Los cambios de idioma se aplican de inmediato, incluidos menús, diálogos, ayudas y etiquetas para lectores de pantalla.',
		Settings: 'Configuración',
		Appearance: 'Apariencia',
		Accessibility: 'Accesibilidad',
		Save: 'Guardar',
		Cancel: 'Cancelar',
		Close: 'Cerrar',
		Delete: 'Eliminar',
		Edit: 'Editar',
		Create: 'Crear',
		Search: 'Buscar',
		Loading: 'Cargando',
		'Loading your vault…': 'Cargando tu bóveda…',
		Retry: 'Reintentar',
		Back: 'Atrás',
		Next: 'Siguiente',
		Done: 'Listo',
		Confirm: 'Confirmar',
		Copy: 'Copiar',
		Copied: 'Copiado',
		'Command Center': 'Centro de comandos',
		'GM Screen': 'Pantalla del DJ',
		Session: 'Sesión',
		Characters: 'Personajes',
		Maps: 'Mapas',
		Story: 'Historia',
		Notes: 'Notas',
		'Player view': 'Vista de jugador',
		'Join a table': 'Unirse a una mesa',
		'Host a live table': 'Organizar una mesa en vivo',
		Profile: 'Perfil',
		Account: 'Cuenta',
		Subscription: 'Suscripción',
		Players: 'Jugadores',
		Permissions: 'Permisos',
		'Vault connections': 'Conexiones de bóveda',
		'Backup & history': 'Copia de seguridad e historial',
		'AI & tools': 'IA y herramientas',
		'No one has joined yet.': 'Aún no se ha unido nadie.',
		'Could not update your profile.': 'No se pudo actualizar tu perfil.',
		'Something didn’t save — please try that again.': 'Algo no se guardó; inténtalo de nuevo.',

		// --- Session lifecycle & projection ---
		Live: 'En vivo',
		Standby: 'En espera',
		Prep: 'Preparación',
		Paused: 'En pausa',
		'Wrapping up': 'Finalizando',
		Recap: 'Resumen',
		Archived: 'Archivada',
		End: 'Terminar',
		'Go live': 'Entrar en vivo',
		'End live session': 'Terminar la sesión en vivo',
		'Go live (unavailable — return to Standby first)':
			'Entrar en vivo (no disponible — vuelve primero a En espera)',
		'Finish {state} and return to Standby before going live':
			'Termina {state} y vuelve a En espera antes de entrar en vivo',
		'Session ended — players returned to standby':
			'Sesión terminada — los jugadores volvieron a espera',
		'You are live — combat, dice, and maps now reach players':
			'Estás en vivo — el combate, los dados y los mapas ya llegan a los jugadores',
		'Create a scene first — a live session needs an active scene.':
			'Crea una escena primero — una sesión en vivo necesita una escena activa.',
		'Go live with a scene first.': 'Entra en vivo con una escena primero.',
		'Session is on standby': 'La sesión está en espera',
		'Go live to open combat, dice, handouts, and what players see.':
			'Entra en vivo para abrir el combate, los dados, el material y lo que ven los jugadores.',
		'Session live': 'Sesión en vivo',
		'Map projected to players': 'Mapa proyectado a los jugadores',
		'Project to players': 'Proyectar a los jugadores',
		'No players yet — add players in Settings → Players first.':
			'Aún no hay jugadores — añádelos primero en Configuración → Jugadores.',
		'Pushed “{title}” to 1 player': '«{title}» enviado a 1 jugador',
		'Pushed “{title}” to {count} players': '«{title}» enviado a {count} jugadores',

		// --- Scene display & scene cards ---
		'Scene display': 'Pantalla de escena',
		'Exit scene display': 'Salir de la pantalla de escena',
		'No scene on display': 'Ninguna escena en pantalla',
		'On display': 'En pantalla',
		'Next card': 'Siguiente carta',
		'Next card ({count} queued)': 'Siguiente carta ({count} en cola)',
		'Clear display': 'Limpiar la pantalla',
		'Second screen': 'Segunda pantalla',
		'Open on a second screen': 'Abrir en una segunda pantalla',
		'Second screen is not available on this device':
			'La segunda pantalla no está disponible en este dispositivo',
		Atmosphere: 'Atmósfera',
		'Scene cards': 'Cartas de escena',
		'New scene card': 'Nueva carta de escena',
		Title: 'Título',
		Mood: 'Ambiente',
		'Flavor text': 'Texto de ambientación',
		'Shown on the display and sent to players (max 500 characters).':
			'Se muestra en la pantalla y se envía a los jugadores (máx. 500 caracteres).',
		'Hero image link': 'Enlace de imagen principal',
		'Remote image links are blocked in the desktop app; scene cards use their mood backdrop.':
			'Los enlaces de imagen remotos están bloqueados en la app de escritorio; las cartas usan su fondo de ambiente.',
		'Optional secure link (https://). Plain http:// images don’t load on Android.':
			'Enlace seguro opcional (https://). Las imágenes http:// no cargan en Android.',
		'Optional image link. Leave blank to use the mood backdrop.':
			'Enlace de imagen opcional. Déjalo vacío para usar el fondo de ambiente.',
		Visibility: 'Visibilidad',
		'Player-visible cards appear on player devices when shown.':
			'Las cartas visibles para jugadores aparecen en sus dispositivos al mostrarlas.',
		'DM only': 'Solo DJ',
		'Player visible': 'Visible para jugadores',
		'Creating…': 'Creando…',
		'Create scene card': 'Crear carta de escena',
		'Cards · {count}': 'Cartas · {count}',
		'Queue · {count}': 'Cola · {count}',
		'Transition style': 'Estilo de transición',
		'No scene cards yet. Create one to set the scene at the table.':
			'Aún no hay cartas de escena. Crea una para ambientar la mesa.',
		'The queue is empty. Queue cards below, then press Next card (Ctrl+→) to play them in order.':
			'La cola está vacía. Añade cartas abajo y pulsa Siguiente carta (Ctrl+→) para reproducirlas en orden.',
		'Ctrl+Shift+S fullscreen · Ctrl+→ next card':
			'Ctrl+Shift+S pantalla completa · Ctrl+→ siguiente carta',
		Show: 'Mostrar',
		'Show again': 'Mostrar de nuevo',
		'No flavor text': 'Sin texto de ambientación',
		'Secure image link required': 'Se requiere un enlace de imagen seguro',
		'Move {title} up': 'Subir {title}',
		'Move {title} down': 'Bajar {title}',
		'Remove {title} from queue': 'Quitar {title} de la cola',
		'{title} is queued': '{title} está en cola',
		'Queue {title}': 'Poner {title} en cola',
		'Make {title} DM only': 'Hacer {title} solo para el DJ',
		'Make {title} player visible': 'Hacer {title} visible para jugadores',
		'Edit {title}': 'Editar {title}',
		'Delete {title}': 'Eliminar {title}',
		'“{title}” deleted': '«{title}» eliminada',
		Undo: 'Deshacer',
		'On Android, scene images need a secure https:// link.':
			'En Android, las imágenes de escena necesitan un enlace seguro https://.',
		'On Android, image links must use https://.':
			'En Android, los enlaces de imagen deben usar https://.',
		'This image link doesn’t load on Android. Replace it with an https:// link or clear it.':
			'Este enlace de imagen no carga en Android. Reemplázalo por un enlace https:// o bórralo.',
		'The scene card couldn’t be created — try again.':
			'La carta de escena no se pudo crear — inténtalo de nuevo.',
		'The card couldn’t be deleted — try again.':
			'La carta no se pudo eliminar — inténtalo de nuevo.',
		'The card couldn’t be restored — try again.':
			'La carta no se pudo restaurar — inténtalo de nuevo.',
		'The card couldn’t be shown — try again.': 'La carta no se pudo mostrar — inténtalo de nuevo.',
		'The card couldn’t be queued — try again.':
			'La carta no se pudo poner en cola — inténtalo de nuevo.',
		'The card couldn’t be saved — try again.': 'La carta no se pudo guardar — inténtalo de nuevo.',
		'The card couldn’t be removed from the queue — try again.':
			'La carta no se pudo quitar de la cola — inténtalo de nuevo.',
		'The queue couldn’t advance — try again.': 'La cola no pudo avanzar — inténtalo de nuevo.',
		'The queue couldn’t be reordered — try again.':
			'La cola no se pudo reordenar — inténtalo de nuevo.',
		'The transition couldn’t be changed — try again.':
			'La transición no se pudo cambiar — inténtalo de nuevo.',
		'Visibility couldn’t be changed — try again.':
			'La visibilidad no se pudo cambiar — inténtalo de nuevo.',

		// --- Status & connection vocabulary ---
		Connected: 'Conectado',
		Invited: 'Invitado',
		'Not connected': 'Sin conexión',
		'Connected to a table': 'Conectado a una mesa',
		'Connected to table': 'Conectado a la mesa',
		'Hosting — waiting for players': 'Anfitrión — esperando jugadores',
		'Local-only — this device': 'Solo local — este dispositivo',
		'Backing up…': 'Guardando copia…',
		'Cloud backup up to date': 'Copia en la nube al día',
		'Cloud backup on': 'Copia en la nube activada',
		'Cloud backup error — see Settings → Backup & history':
			'Error de copia en la nube — ver Configuración → Copia de seguridad e historial',
		Online: 'En línea',
		Away: 'Ausente',
		Offline: 'Desconectado',
		Quests: 'Misiones',
	},
};

// These must outlive a provider effect. When the user switches from Spanish back to English, the
// DOM currently contains Spanish; retaining the original source prevents that translated text from
// being mistaken for a new source key on the next observer pass.
type RenderedMessage = { source: string; rendered: string };
const renderedTextSources = new WeakMap<Text, RenderedMessage>();
const renderedAttributeSources = new WeakMap<Element, Map<string, RenderedMessage>>();

export function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
	if (!value) return null;
	const language = value.toLowerCase().split('-')[0];
	return SUPPORTED_LOCALES.some((locale) => locale.code === language)
		? (language as SupportedLocale)
		: null;
}

export function initialLocale(
	stored: string | null,
	browserLanguages: readonly string[] = [],
): SupportedLocale {
	return normalizeLocale(stored) ?? browserLanguages.map(normalizeLocale).find(Boolean) ?? 'en';
}

export function translate(locale: SupportedLocale, source: string, values?: MessageValues): string {
	const message = MESSAGES[locale][source] ?? source;
	if (!values) return message;
	return message.replace(/\{(\w+)\}/g, (match, key: string) =>
		key in values ? String(values[key]) : match,
	);
}

type I18nContextValue = {
	locale: SupportedLocale;
	setLocale: (locale: SupportedLocale) => void;
	t: (source: string, values?: MessageValues) => string;
	formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/** Translate existing markup as well as `t()` callers. This is a migration bridge, not a visual
 * overlay: it handles lazy routes, portals/toasts, and accessible attributes as they mount. New UI
 * should still call `t()` so translators have stable, explicit source keys. */
function useRenderedLocalization(locale: SupportedLocale) {
	useEffect(() => {
		const attributes = ['aria-label', 'aria-description', 'placeholder', 'title', 'alt', 'value'];
		const isLocalizable = (element: Element | null) =>
			Boolean(
				element &&
				!element.closest('script, style, textarea, [contenteditable="true"], [data-i18n-skip]'),
			);
		const translateText = (node: Text) => {
			if (!isLocalizable(node.parentElement) || !node.data.trim()) return;
			const previous = renderedTextSources.get(node);
			// React may replace a dynamic text node in place (for example "1 player" → "2 players").
			// Only retain the old source when the node still contains our last rendered translation.
			const source = previous?.rendered === node.data ? previous.source : node.data;
			const translated = translate(locale, source);
			renderedTextSources.set(node, { source, rendered: translated });
			if (node.data !== translated) node.data = translated;
		};
		const translateAttribute = (element: Element, attribute: string) => {
			if (!isLocalizable(element) || !element.hasAttribute(attribute)) return;
			const sources = renderedAttributeSources.get(element) ?? new Map<string, RenderedMessage>();
			renderedAttributeSources.set(element, sources);
			const current = element.getAttribute(attribute) ?? '';
			const previous = sources.get(attribute);
			const source = previous?.rendered === current ? previous.source : current;
			const translated = translate(locale, source);
			sources.set(attribute, { source, rendered: translated });
			if (element.getAttribute(attribute) !== translated)
				element.setAttribute(attribute, translated);
		};
		const translateTree = (root: Node) => {
			if (root.nodeType === Node.TEXT_NODE) translateText(root as Text);
			if (root.nodeType === Node.ELEMENT_NODE) {
				const element = root as Element;
				attributes.forEach((attribute) => translateAttribute(element, attribute));
				element
					.querySelectorAll('*')
					.forEach((child) =>
						attributes.forEach((attribute) => translateAttribute(child, attribute)),
					);
			}
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let node: Node | null;
			while ((node = walker.nextNode())) translateText(node as Text);
		};
		translateTree(document.body);
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === 'characterData') translateText(mutation.target as Text);
				else if (mutation.type === 'attributes')
					translateAttribute(mutation.target as Element, mutation.attributeName ?? '');
				else mutation.addedNodes.forEach(translateTree);
			}
		});
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: attributes,
		});
		return () => observer.disconnect();
	}, [locale]);
}

export function I18nProvider({ children }: { children: ReactNode }) {
	const [locale, setLocaleState] = useState<SupportedLocale>(() => {
		try {
			return initialLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY), navigator.languages);
		} catch {
			return initialLocale(null, navigator.languages);
		}
	});
	useRenderedLocalization(locale);
	useEffect(() => {
		document.documentElement.lang = locale;
		try {
			window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
		} catch {
			// Private browsing may reject storage; the live preference still works for this session.
		}
	}, [locale]);
	const value = useMemo<I18nContextValue>(
		() => ({
			locale,
			setLocale: setLocaleState,
			t: (source, values) => translate(locale, source, values),
			formatDate: (date, options) => new Intl.DateTimeFormat(locale, options).format(date),
			formatNumber: (number, options) => new Intl.NumberFormat(locale, options).format(number),
		}),
		[locale],
	);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
	const context = useContext(I18nContext);
	if (!context) throw new Error('useI18n must be used inside I18nProvider.');
	return context;
}
