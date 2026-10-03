import { en, type MessageKey } from './en';

/** French scaffold: untranslated messages explicitly retain the English fallback. */
export const fr: Record<MessageKey, string> = {
	...en,
	'common.action.removeTag': 'Supprimer {tag}',
	'boardCanvas.binding.bound': 'Lié',
	'boardCanvas.binding.unbound': 'Non lié',
	'boardCanvas.binding.missing': 'Introuvable',
	'boardCanvas.binding.conflicted': 'Conflit',
	'boardCanvas.binding.hidden': 'Masqué',
	'boardCanvas.binding.boundTo': 'Lié à {name}',
	'boardCanvas.tile.content': 'Contenu de {title}',
	'boardCanvas.tile.resize': 'Redimensionner {title}',
	'boardCanvas.tile.resizeHelp':
		'Cliquez pour alterner entre les tailles petite, moyenne et grande. Utilisez les touches fléchées pour redimensionner ; Échap revient à la tuile.',
};
