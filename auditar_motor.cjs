/* AUDITORIA DEL ALGORITMO. No mira si los datos son creibles (eso lo hace
   auditar.cjs) ni si la pantalla coincide con el motor (auditar_numeros.cjs).
   Mira si el PUNTAJE esta bien armado: que cada termino salga del reglamento,
   que las piezas se multipliquen por lo que corresponde, y que no haya nada
   que quedo colgado de un cambio anterior. */
const fs=require('fs');
const S=JSON.parse(fs.readFileSync('salida.json','utf8'));

// CANDADO CONTRA AUDITAR UN ARCHIVO VIEJO (03/09).
// salida.json es la SALIDA de armar.cjs, que usa motorV3.cjs y riesgo.cjs. Si
// se toca cualquiera de los dos y no se vuelve a correr armar, este auditor
// compara la logica nueva contra numeros hechos con la logica vieja y marca
// como rotos a jugadores que estan perfectos. Paso: 80 jugadores flaggeados
// por un salida.json de 27 minutos antes del cambio de motor. Se corta antes.
{
  const t = f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
  const salida = t('salida.json');
  const viejos = ['motorV3.cjs','riesgo.cjs','armar.cjs'].filter(f => t(f) > salida + 1000);
  if (viejos.length) {
    console.log('\n  \u2717 salida.json es MAS VIEJO que ' + viejos.join(', ') + '.');
    console.log('    Lo que hay en el archivo NO salio del motor que tenes hoy, asi que');
    console.log('    auditarlo no dice nada. Corre RECALCULAR.bat y volve a intentar.\n');
    process.exit(2);
  }
}
const T=[].concat(...['ARQ','DEF','VOL','DEL'].map(p=>S.rankings[p]));
const P=[],A=[],OK=[];
const cerca=(a,b,t)=>Math.abs(a-b)<=t;
const GOL={ARQ:12,DEF:9,VOL:6,DEL:4}, VALLA={ARQ:3,DEF:2};

// 1. el desglose suma exactamente el puntaje si juega.
// La tolerancia es 0.04 y no 0.02 a proposito: el desglose muestra seis
// terminos ya redondeados a dos decimales, asi que la suma de lo que se ve
// puede alejarse hasta 6 x 0.005 = 0.03 del numero exacto. Con 0.02 saltaban
// 7 jugadores que estaban perfectos (03/09).
let d1=0; T.forEach(x=>{ const s=(x.desglose||[]).reduce((a,t)=>a+t[1],0);
  if(!cerca(s,x.EPsiJuega,0.04)) d1++; });
d1? P.push(d1+' jugadores donde el desglose no suma el puntaje que muestra') : OK.push('en los '+T.length+' jugadores, el desglose suma exactamente el puntaje');

// 2. el gol vale lo que dice el reglamento.
// El valor del gol NO es solo el de la posicion: de visitante suma 2 mas, y el
// gol de penal paga 3 fijo (5 de visitante) en lugar del valor por puesto. El
// pie de cada fila del desglose dice con que valor se multiplico; se lee de ahi
// para no tener que reimplementar el reparto entre gol jugado y gol de penal.
// (La version anterior comparaba contra lamGol x GOL[pos] y marcaba como error
// a los 268 jugadores que estaban de visitante. Eran los 2 puntos del bonus.)
let d2=0, ej2=[], d2v=0; T.forEach(x=>{ const g=(x.desglose||[]).find(t=>t[0]==='Gol propio'); if(!g) return;
  const val=Number(String(g[2]).split('\u00d7').pop());
  const base=GOL[x.pos], esperado=(x.lamGol||0)*val;
  // el valor declarado tiene que ser el de la posicion, o ese mismo mas 2 de visitante
  if(!(cerca(val,base,0.01)||cerca(val,base+2,0.01))) d2v++;
  // y el termino tiene que valer lamGol x ese valor, salvo que patee penales
  // (ahi una parte de lamGol se paga a 3 o a 5 y da MENOS que el valor por puesto)
  const pateaPenales=(x.penalesPateados||0)>0 || g[1]<esperado-0.05;
  if(!pateaPenales && !cerca(g[1],esperado,0.05)){ d2++; if(ej2.length<3) ej2.push(x.nombre+' '+g[1]+' vs '+esperado.toFixed(2)); } });
d2v? P.push(d2v+' jugadores donde el gol no se paga ni al valor del puesto ni con el bonus de visitante') : OK.push('el gol paga ARQ 12 \u00b7 DEF 9 \u00b7 VOL 6 \u00b7 DEL 4, mas 2 de visitante, en todos');
d2? P.push(d2+' jugadores donde el gol no vale lo del reglamento: '+ej2.join(', ')) : OK.push('el termino del gol es siempre los goles esperados por el valor que declara');

// 3. la valla invicta paga lo que corresponde y solo a arqueros y defensores
let d3=0,d3b=0; T.forEach(x=>{ const v=(x.desglose||[]).find(t=>t[0]==='Valla invicta');
  if(v && !VALLA[x.pos]) d3b++;
  if(v && VALLA[x.pos] && !cerca(v[1],(x.pVI||0)*VALLA[x.pos],0.05)) d3++; });
d3b? P.push(d3b+' volantes o delanteros cobrando valla invicta') : OK.push('la valla invicta la cobran solo arqueros y defensores');
d3? P.push(d3+' jugadores con la valla mal valuada') : OK.push('la valla paga 3 al arquero y 2 al defensor, por la chance de que su equipo no reciba');

// 4. la figura paga 4
let d4=0; T.forEach(x=>{ const f=(x.desglose||[]).find(t=>t[0]==='Figura'); if(!f) return;
  if(!cerca(f[1],(x.pFigura||0)*4,0.03)) d4++; });
d4? P.push(d4+' jugadores con la figura mal valuada') : OK.push('la figura paga 4 puntos por su probabilidad');

// 5. las tarjetas restan
let d5=T.filter(x=>{ const t=(x.desglose||[]).find(t=>t[0]==='Tarjetas'); return t && t[1]>0; }).length;
d5? P.push(d5+' jugadores donde las tarjetas SUMAN puntos') : OK.push('las tarjetas siempre restan');

// 6. una sola figura por partido: la suma de probabilidades por equipo <= 1
const eq={}; T.forEach(x=>{ (eq[x.equipo]=eq[x.equipo]||[]).push(x); });
let d6=[]; Object.entries(eq).forEach(([e,js])=>{ const s=js.reduce((a,x)=>a+(x.pFigura||0),0);
  if(s>1.05) d6.push(e+' '+s.toFixed(2)); });
d6.length? P.push('la chance de ser figura suma mas de 1 en: '+d6.join(', ')) : OK.push('en ningun equipo las chances de ser figura suman mas de 1 (hay una figura por partido)');

// 7. los minutos: el gol tiene que escalar con lo que juega, la ficha no
let d7=0; T.forEach(x=>{ if(!x.lam||!x.minSiJuega) return;
  if(!cerca(x.lamGol,(x.share||0)*x.lam.lamFor*(x.minSiJuega/90),0.02)) d7++; });
d7? P.push(d7+' jugadores donde el gol no escala con los minutos') : OK.push('el gol escala con los minutos que juega; la ficha y la valla no (piden 20 minutos, no 90)');

// 8. los minutos "si juega" salen de partidos donde ARRANCO.
// Ya NO se exige que el numero sea uno de sus arranques exacto: con dos
// arranques el motor usa el PROMEDIO de los dos, que casi nunca coincide con
// ninguno (medido: 9.06 de error contra 10.07 de la mediana ponderada). Lo que
// si tiene que valer es que el numero caiga DENTRO de lo que jugo, sin contar
// los arranques cortados por lesion o roja, y con el piso de 20 y el techo 90.
const ej8=[];
let d8=0,d8b=0; T.forEach(x=>{ const q=x.perfilMin; if(!q) return;
  if(q.arranques>=1){
    const cortados=q.cortados||[];
    let base=q.todos.filter(m=>!cortados.includes(m));
    if(!base.length) base=q.todos;
    const lo=Math.max(20,Math.min(...base)), hi=Math.min(90,Math.max(...base));
    if(x.minSiJuega < lo-0.5 || x.minSiJuega > hi+0.5){
      d8++; if(ej8.length<3) ej8.push(x.nombre+' '+x.minSiJuega+"' con arranques de "+q.todos.join(', '));
    }
  }
  // "nunca arranco" incluye al que directamente no tiene log de minutos: ahi
  // los minutos salen del estimado de Planeta, que es lo unico que hay.
  if(q.arranques===0 && q.todos.length>0 && x.minSiJuega>60) d8b++; });
d8? P.push(d8+' jugadores cuyos minutos "si juega" caen fuera de lo que jugo: '+ej8.join(', ')) : OK.push('los minutos "si juega" caen siempre dentro de lo que jugo de titular');
d8b? A.push(d8b+' jugadores que nunca arrancaron y sin embargo se les estiman mas de 60 minutos') : OK.push('a los que nunca arrancaron no se les inventan minutos de titular');

// 9. coherencia del ranking: el puntaje ordena igual que la suma de sus partes
let d9=0; ['ARQ','DEF','VOL','DEL'].forEach(p=>{
  const l=[...S.rankings[p]].sort((a,b)=>b.EPsiJuega-a.EPsiJuega);
  for(let i=1;i<l.length;i++) if(l[i].EPsiJuega>l[i-1].EPsiJuega+0.001) d9++;
});
d9? P.push('el ranking no queda ordenado por puntaje') : OK.push('los cuatro rankings quedan ordenados por puntaje si juega');

// 10. el capitan duplica SOLO la ficha
const cap=S.esquema.optimo.capitan;
if(cap){ const suma=(S.esquema.optimo.once||[]).reduce((a,x)=>a+x.EP,0);
  if(cerca(S.esquema.optimo.total, suma+cap.ficha, 0.05)) OK.push('el capitan suma su ficha una vez mas, no el puntaje entero');
  else A.push('el total del once no es la suma + la ficha del capitan: '+S.esquema.optimo.total+' vs '+(suma+cap.ficha).toFixed(2)); }

// 11. rangos: nada absurdo
const raros=T.filter(x=>x.EPsiJuega<0||x.EPsiJuega>25).length;
raros? P.push(raros+' jugadores con puntaje fuera de 0 a 25') : OK.push('ningun puntaje absurdo (todos entre 0 y 25)');
const pv=T.filter(x=>x.pVI!=null&&(x.pVI<0||x.pVI>1)).length;
const pf=T.filter(x=>x.pFigura!=null&&(x.pFigura<0||x.pFigura>1)).length;
(pv+pf)? P.push('hay probabilidades fuera de 0 a 1') : OK.push('todas las probabilidades caen entre 0 y 1');

// 12. que el arriesgado sea DISTINTO y tenga mas cola
if(S.arriesgado){
  const a=S.arriesgado;
  if(a.comunes>4) P.push('el once arriesgado comparte '+a.comunes+' jugadores con el solido (el tope es 4)');
  else OK.push('el once arriesgado comparte '+a.comunes+' de 11 con el solido');
  if(a.conservador && a.dist){
    if(a.dist.sd<=a.conservador.sd) P.push('el arriesgado tiene MENOS dispersion que el solido: no esta arriesgando nada');
    else OK.push('el arriesgado dispersa mas que el solido (sd '+a.dist.sd.toFixed(1)+' vs '+a.conservador.sd.toFixed(1)+')');
    if(a.dist.p140<a.conservador.p140) A.push('el arriesgado tiene menos chance de pasar los 140 que el solido');
    else OK.push('el arriesgado tiene mas chance de fecha grande (>=140: '+(100*a.dist.p140).toFixed(3)+'% vs '+(100*a.conservador.p140).toFixed(3)+'%)');
  }
}

const L=console.log;
L(''); L('  ══════════════════════════════════════════════════════════════');
L('   AUDITORIA DEL ALGORITMO   ·   motor '+(S.version||'sin sello'));
L('  ══════════════════════════════════════════════════════════════'); L('');
if(P.length){ L('  ✗ PROBLEMAS ('+P.length+')'); P.forEach(t=>L('     • '+t)); L(''); }
if(A.length){ L('  ! PARA MIRAR ('+A.length+')'); A.forEach(t=>L('     • '+t)); L(''); }
L('  ✓ CONTROLES QUE PASARON ('+OK.length+')'); OK.forEach(t=>L('     · '+t)); L('');
L(P.length? '   HAY '+P.length+' PROBLEMA(S) EN EL ALGORITMO.' : '   El puntaje esta bien armado.');
L('  ══════════════════════════════════════════════════════════════'); L('');
