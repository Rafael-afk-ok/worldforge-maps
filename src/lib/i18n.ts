export type Lang = "pt" | "en" | "es";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "pt", label: "Português" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

const pt = {
  overview: "Visão geral", appearance: "Aparência", regionsTab: "Regiões", diplomacyTab: "Diplomacia", photosTab: "Fotos", economyTab: "Economia", positionTab: "Posição", worldStatus: "Status do mundo", mainMenu: "Menu principal", noPhoto: "Nenhuma foto adicionada.",
  appName: "Frontiers Map Simulator",
  tools: "Ferramentas", close: "Fechar", mover: "✋ Mover / Selecionar", pintar: "🖌 Pintar território", balde: "🪣 Preencher área", apagar: "🧽 Apagar",
  capital: "★ Capital", cidade: "● Cidade", forte: "▲ Forte", porto: "⚓ Porto", estrada: "━ Estrada", rota: "┅ Rota marítima",
  regiao: "▦ Região", comentario: "💬 Comentário",
  brushSize: "Tamanho do pincel", smooth: "Bordas suaves", grid: "Grade", finishLine: "Concluir traçado",
  nations: "Nações", newNation: "+ Nova", filter: "Filtrar relações", allNations: "Todas as nações", noNations: "Nenhuma nação.",
  paintingWith: "Pintando com", pickNation: "Escolha a nação para pintar:", createFirst: "Crie uma nação para começar a pintar.", createNation: "Criar nação",
  bgMap: "Mapa de fundo", bgImage: "Imagem do mapa", opacity: "Opacidade", fit: "Encaixe", fitContain: "Imagem inteira", fitCover: "Preencher mapa", fitStretch: "Esticar",
  scale: "Escala", posX: "Posição horizontal", posY: "Posição vertical", rotation: "Rotação", reset: "Restaurar", removeBg: "Remover fundo",
  exportWorld: "Exportar mundo", importWorld: "Importar mundo", clearMap: "Limpar mapa", confirmClear: "Apagar tudo?",
  zoomOut: "Diminuir zoom", zoomIn: "Aumentar zoom", fitMap: "Encaixar mapa", undo: "Desfazer", redo: "Refazer", light: "Modo claro", dark: "Modo escuro",
  fullscreen: "Tela cheia paisagem", exitFullscreen: "Sair da tela cheia", settings: "Configurações", language: "Idioma",
  nationName: "Nome da nação", color: "Cor", territories: "territórios", flag: "Bandeira", uploadFlag: "Enviar imagem da bandeira", flagUrl: "ou cole o link de uma imagem",
  removeFlag: "Remover bandeira", relation: "Relação", ruler: "Governante", treaties: "Tratados", notes: "Observações",
  paintThis: "Pintar território desta nação", deleteNation: "Excluir nação", confirmDeleteNation: "Excluir nação?", delete: "Excluir", deleteLine: "Excluir traçado",
  points: "pontos", newNationName: "Nova nação", newMarker: "Novo local",
  rel_propria: "Minha nação", rel_aliada: "Aliada", rel_neutra: "Neutra", rel_inimiga: "Inimiga",
  m_capital: "Capital", m_cidade: "Cidade", m_forte: "Forte", m_porto: "Porto", l_estrada: "Estrada", l_rota: "Rota marítima",
  rotate: "Gire o celular para usar o mapa em paisagem.", rotateFallback: "Gire o celular para paisagem; a tela cheia depende do navegador.",
  invalidImage: "Escolha uma imagem válida.", imageFail: "Não foi possível abrir esta imagem.", storageFull: "Armazenamento cheio (imagem muito grande?)",
  exported: "Cópia do mundo exportada com bandeiras e imagens.", confirmImport: "Importar este mundo substituirá o mapa atual. Deseja continuar?",
  imported: "Mundo importado com sucesso.", invalidFile: "Arquivo inválido. Escolha uma cópia JSON exportada pelo app.", mapLabel: "Mapa de nações",
  npcs: "População / NPCs", grossIncome: "Renda bruta (esmeraldas)", expenses: "Gasto (esmeraldas)", netIncome: "Lucro líquido", production: "Produção",
  photo: "Foto do local", uploadPhoto: "Enviar foto", photoUrl: "ou cole o link da foto", removePhoto: "Remover foto", emeralds: "esmeraldas"
};
export type Dict = typeof pt;

const en: Dict = {
  overview: "Overview", appearance: "Appearance", regionsTab: "Regions", diplomacyTab: "Diplomacy", photosTab: "Photos", economyTab: "Economy", positionTab: "Position", worldStatus: "World status", mainMenu: "Main menu", noPhoto: "No photo added.",
  appName: "Frontiers Map Simulator",
  tools: "Tools", close: "Close", mover: "✋ Move / Select", pintar: "🖌 Paint territory", balde: "🪣 Fill area", apagar: "🧽 Erase",
  capital: "★ Capital", cidade: "● City", forte: "▲ Fort", porto: "⚓ Port", estrada: "━ Road", rota: "┅ Sea route",
  regiao: "▦ Region", comentario: "💬 Comment",
  brushSize: "Brush size", smooth: "Smooth borders", grid: "Grid", finishLine: "Finish path",
  nations: "Nations", newNation: "+ New", filter: "Filter relations", allNations: "All nations", noNations: "No nations.",
  paintingWith: "Painting with", pickNation: "Choose the nation to paint:", createFirst: "Create a nation to start painting.", createNation: "Create nation",
  bgMap: "Background map", bgImage: "Map image", opacity: "Opacity", fit: "Fit", fitContain: "Whole image", fitCover: "Fill map", fitStretch: "Stretch",
  scale: "Scale", posX: "Horizontal position", posY: "Vertical position", rotation: "Rotation", reset: "Reset", removeBg: "Remove background",
  exportWorld: "Export world", importWorld: "Import world", clearMap: "Clear map", confirmClear: "Erase everything?",
  zoomOut: "Zoom out", zoomIn: "Zoom in", fitMap: "Fit map", undo: "Undo", redo: "Redo", light: "Light mode", dark: "Dark mode",
  fullscreen: "Landscape fullscreen", exitFullscreen: "Exit fullscreen", settings: "Settings", language: "Language",
  nationName: "Nation name", color: "Color", territories: "tiles", flag: "Flag", uploadFlag: "Upload flag image", flagUrl: "or paste an image link",
  removeFlag: "Remove flag", relation: "Relation", ruler: "Ruler", treaties: "Treaties", notes: "Notes",
  paintThis: "Paint this nation's territory", deleteNation: "Delete nation", confirmDeleteNation: "Delete nation?", delete: "Delete", deleteLine: "Delete path",
  points: "points", newNationName: "New nation", newMarker: "New place",
  rel_propria: "My nation", rel_aliada: "Ally", rel_neutra: "Neutral", rel_inimiga: "Enemy",
  m_capital: "Capital", m_cidade: "City", m_forte: "Fort", m_porto: "Port", l_estrada: "Road", l_rota: "Sea route",
  rotate: "Rotate your phone to use the map in landscape.", rotateFallback: "Rotate your phone to landscape; fullscreen depends on the browser.",
  invalidImage: "Choose a valid image.", imageFail: "Could not open this image.", storageFull: "Storage full (image too large?)",
  exported: "World backup exported with flags and images.", confirmImport: "Importing this world will replace the current map. Continue?",
  imported: "World imported successfully.", invalidFile: "Invalid file. Choose a JSON backup exported by the app.", mapLabel: "Nations map",
  npcs: "Population / NPCs", grossIncome: "Gross income (emeralds)", expenses: "Expenses (emeralds)", netIncome: "Net profit", production: "Production",
  photo: "Place photo", uploadPhoto: "Upload photo", photoUrl: "or paste photo link", removePhoto: "Remove photo", emeralds: "emeralds"
};

const es: Dict = {
  overview: "Vista general", appearance: "Apariencia", regionsTab: "Regiones", diplomacyTab: "Diplomacia", photosTab: "Fotos", economyTab: "Economía", positionTab: "Posición", worldStatus: "Estado del mundo", mainMenu: "Menú principal", noPhoto: "No hay fotos añadidas.",
  appName: "Frontiers Map Simulator",
  tools: "Herramientas", close: "Cerrar", mover: "✋ Mover / Seleccionar", pintar: "🖌 Pintar territorio", balde: "🪣 Rellenar área", apagar: "🧽 Borrar",
  capital: "★ Capital", cidade: "● Ciudad", forte: "▲ Fuerte", porto: "⚓ Puerto", estrada: "━ Camino", rota: "┅ Ruta marítima",
  regiao: "▦ Región", comentario: "💬 Comentario",
  brushSize: "Tamaño del pincel", smooth: "Bordes suaves", grid: "Cuadrícula", finishLine: "Terminar trazado",
  nations: "Naciones", newNation: "+ Nueva", filter: "Filtrar relaciones", allNations: "Todas las naciones", noNations: "Ninguna nación.",
  paintingWith: "Pintando con", pickNation: "Elige la nación para pintar:", createFirst: "Crea una nación para empezar a pintar.", createNation: "Crear nación",
  bgMap: "Mapa de fondo", bgImage: "Imagen del mapa", opacity: "Opacidad", fit: "Ajuste", fitContain: "Imagen completa", fitCover: "Llenar mapa", fitStretch: "Estirar",
  scale: "Escala", posX: "Posición horizontal", posY: "Posición vertical", rotation: "Rotación", reset: "Restaurar", removeBg: "Quitar fondo",
  exportWorld: "Exportar mundo", importWorld: "Importar mundo", clearMap: "Limpiar mapa", confirmClear: "¿Borrar todo?",
  zoomOut: "Alejar", zoomIn: "Acercar", fitMap: "Ajustar mapa", undo: "Deshacer", redo: "Rehacer", light: "Modo claro", dark: "Modo oscuro",
  fullscreen: "Pantalla completa horizontal", exitFullscreen: "Salir de pantalla completa", settings: "Configuración", language: "Idioma",
  nationName: "Nombre de la nación", color: "Color", territories: "territorios", flag: "Bandera", uploadFlag: "Subir imagen de bandera", flagUrl: "o pega el enlace de una imagen",
  removeFlag: "Quitar bandera", relation: "Relación", ruler: "Gobernante", treaties: "Tratados", notes: "Observaciones",
  paintThis: "Pintar territorio de esta nación", deleteNation: "Eliminar nación", confirmDeleteNation: "¿Eliminar nación?", delete: "Eliminar", deleteLine: "Eliminar trazado",
  points: "puntos", newNationName: "Nueva nación", newMarker: "Nuevo lugar",
  rel_propria: "Mi nación", rel_aliada: "Aliada", rel_neutra: "Neutral", rel_inimiga: "Enemiga",
  m_capital: "Capital", m_cidade: "Ciudad", m_forte: "Fuerte", m_porto: "Puerto", l_estrada: "Camino", l_rota: "Ruta marítima",
  rotate: "Gira el móvil para usar el mapa en horizontal.", rotateFallback: "Gira el móvil a horizontal; la pantalla completa depende del navegador.",
  invalidImage: "Elige una imagen válida.", imageFail: "No se pudo abrir esta imagen.", storageFull: "Almacenamiento lleno (¿imagen muy grande?)",
  exported: "Copia del mundo exportada con banderas e imágenes.", confirmImport: "Importar este mundo reemplazará el mapa actual. ¿Continuar?",
  imported: "Mundo importado con éxito.", invalidFile: "Archivo no válido. Elige una copia JSON exportada por la app.", mapLabel: "Mapa de naciones",
  npcs: "Población / NPCs", grossIncome: "Ingreso bruto (esmeraldas)", expenses: "Gasto (esmeraldas)", netIncome: "Beneficio neto", production: "Producción",
  photo: "Foto del lugar", uploadPhoto: "Subir foto", photoUrl: "o pega el enlace de la foto", removePhoto: "Quitar foto", emeralds: "esmeraldas"
};

export const DICTS: Record<Lang, Dict> = { pt, en, es };
