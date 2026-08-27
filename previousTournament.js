const PREVIOUS_TOURNAMENT_TOP20 = [
  { rank: 1, name: "Ávalos, Gabriel", pos: "DEL", team: "Independiente", points: 168, goals: 10, figuras: 4, cleanSheets: 0, avg: 9.88, badge: "👑" },
  { rank: 2, name: "Tarragona, Cristian", pos: "DEL", team: "Unión", points: 145, goals: 8, figuras: 3, cleanSheets: 0, avg: 8.53, badge: "🥈" },
  { rank: 3, name: "Zelarayán, Lucas", pos: "VOL", team: "Belgrano", points: 135, goals: 4, figuras: 4, cleanSheets: 0, avg: 9.00, badge: "🥉" },
  { rank: 3, name: "Montiel, Gonzalo", pos: "DEF", team: "River", points: 135, goals: 4, figuras: 2, cleanSheets: 6, avg: 9.00, badge: "🥉" },
  { rank: 5, name: "Di María, Ángel", pos: "VOL", team: "Rosario Ctral.", points: 132, goals: 5, figuras: 5, cleanSheets: 0, avg: 11.00, badge: "⭐" },
  { rank: 5, name: "Barros Schelotto, Nicolás", pos: "VOL", team: "Gimnasia LP", points: 132, goals: 4, figuras: 4, cleanSheets: 0, avg: 8.25, badge: "⭐" },
  { rank: 7, name: "Sartori, Fabrizio", pos: "DEL", team: "Ind. Rivadavia", points: 129, goals: 7, figuras: 1, cleanSheets: 0, avg: 8.06, badge: "⭐" },
  { rank: 8, name: "Álvarez, Francisco", pos: "DEF", team: "Argentinos", points: 126, goals: 2, figuras: 1, cleanSheets: 9, avg: 7.88, badge: "⭐" },
  { rank: 8, name: "Montero, Álvaro", pos: "ARQ", team: "Vélez", points: 126, goals: 0, figuras: 3, cleanSheets: 7, avg: 7.41, badge: "⭐" },
  { rank: 10, name: "Beltrán, Santiago", pos: "ARQ", team: "River", points: 125, goals: 0, figuras: 2, cleanSheets: 8, avg: 7.35, badge: "⭐" },
  { rank: 11, name: "Torres, Marcelo", pos: "DEL", team: "Gimnasia LP", points: 124, goals: 7, figuras: 0, cleanSheets: 0, avg: 7.29, badge: "⭐" },
  { rank: 12, name: "Schott, Augusto", pos: "DEF", team: "Talleres", points: 123, goals: 3, figuras: 1, cleanSheets: 5, avg: 7.69, badge: "⭐" },
  { rank: 12, name: "Méndez, Mauro", pos: "DEL", team: "Banfield", points: 123, goals: 6, figuras: 1, cleanSheets: 0, avg: 7.69, badge: "⭐" },
  { rank: 14, name: "Romero, David", pos: "DEL", team: "Tigre", points: 122, goals: 7, figuras: 3, cleanSheets: 0, avg: 10.17, badge: "⭐" },
  { rank: 15, name: "Galíndez, Hernán", pos: "ARQ", team: "Huracán", points: 121, goals: 0, figuras: 3, cleanSheets: 6, avg: 7.56, badge: "⭐" },
  { rank: 16, name: "Monzón, Florián", pos: "DEL", team: "Vélez", points: 119, goals: 6, figuras: 3, cleanSheets: 0, avg: 7.93, badge: "⭐" },
  { rank: 17, name: "Cerato, Giuliano", pos: "DEF", team: "Instituto", points: 118, goals: 2, figuras: 2, cleanSheets: 4, avg: 7.38, badge: "⭐" },
  { rank: 18, name: "Marabel, Junior", pos: "DEL", team: "Sarmiento", points: 117, goals: 6, figuras: 1, cleanSheets: 0, avg: 7.31, badge: "⭐" },
  { rank: 18, name: "Caicedo, Jordy", pos: "DEL", team: "Huracán", points: 117, goals: 8, figuras: 1, cleanSheets: 0, avg: 7.31, badge: "⭐" },
  { rank: 20, name: "Lanzini, Manuel", pos: "VOL", team: "Vélez", points: 116, goals: 3, figuras: 1, cleanSheets: 0, avg: 7.25, badge: "⭐" }
];

if (typeof window !== 'undefined') window.PREVIOUS_TOURNAMENT_TOP20 = PREVIOUS_TOURNAMENT_TOP20;
if (typeof global !== 'undefined') global.PREVIOUS_TOURNAMENT_TOP20 = PREVIOUS_TOURNAMENT_TOP20;
if (typeof module !== 'undefined' && module.exports) module.exports = { PREVIOUS_TOURNAMENT_TOP20 };
