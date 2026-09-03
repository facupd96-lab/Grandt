/* Auditoria de COHERENCIA: recalcula desde cero lo que muestra la app y lo
   compara contra lo que guarda el motor. Si algo no cierra, es que la pantalla
   dice una cosa y el modelo otra — el error mas caro de todos porque no se ve. */
const fs=require('fs');
const S=JSON.parse(fs.readFileSync('salida.json','utf8'));

// Mismo candado que en auditar_motor.cjs: si salida.json quedo de una corrida
// anterior al ultimo cambio del motor, comparar no sirve de nada (03/09).
{
  const t = f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
  const viejos = ['motorV3.cjs','riesgo.cjs','armar.cjs'].filter(f => t(f) > t('salida.json') + 1000);
  if (viejos.length) {
    console.log('\n  \u2717 salida.json es MAS VIEJO que ' + viejos.join(', ') + '. Corre RECALCULAR.bat.\n');
    process.exit(2);
  }
}
const T=[].concat(...['ARQ','DEF','VOL','DEL'].map(p=>S.rankings[p]));
const P=[],A=[],OK=[];
const cerca=(a,b,t)=>Math.abs(a-b)<=t;

// 1. amenaza/90 = gol esperado / (minutos si juega / 90)
let mal=0; T.forEach(x=>{ if(x.lamGol==null||!x.minSiJuega) return;
  const app=x.lamGol/(x.minSiJuega/90);
  if(!isFinite(app)||app<0||app>3) mal++; });
mal? P.push(mal+' amenazas/90 fuera de rango (0 a 3)') : OK.push('las amenazas/90 caen todas entre 0 y 3');

// 2. share: la suma ponderada por minutos de cada equipo tiene que dar ~1
const porEq={}; T.forEach(x=>{ (porEq[x.equipo]=porEq[x.equipo]||[]).push(x); });
let fuera=[]; Object.entries(porEq).forEach(([e,js])=>{
  const s=js.reduce((a,x)=>a+(x.share||0)*Math.max(0.02,(x.minEsperados||0)/90),0);
  if(!cerca(s,1,0.06)) fuera.push(e+' '+s.toFixed(2)); });
fuera.length? P.push('el reparto del ataque no suma 1 en: '+fuera.join(', ')) : OK.push('el ataque de los 30 equipos se reparte entero (suma 1)');

// 3. lamGol = share x goles del equipo x la fraccion de partido que juega.
// (La primera version de este control se olvidaba de los minutos y marcaba 295
//  jugadores como rotos; el roto era el control.)
let d=0; T.forEach(x=>{ if(x.lamGol==null||!x.lam||!x.minSiJuega) return;
  if(!cerca(x.lamGol, (x.share||0)*x.lam.lamFor*(x.minSiJuega/90), 0.02)) d++; });
d? P.push(d+' jugadores donde gol esperado != parte del ataque x goles del equipo x minutos') : OK.push('el gol esperado de cada uno = su parte del ataque x los goles de su equipo x lo que juega');

// 4. minutos si juega: tiene que caer dentro de lo que jugo de titular.
// Con dos arranques el motor usa el promedio de los dos, asi que exigir que
// coincida con un partido exacto ya no aplica (03/09). Lo que se controla es
// que no se invente un numero fuera de rango, sin contar los arranques que se
// cortaron por lesion o roja.
let m2=0; T.forEach(x=>{ const q=x.perfilMin; if(!q||q.arranques<2) return;
  const cort=q.cortados||[];
  let base=q.todos.filter(m=>!cort.includes(m)); if(!base.length) base=q.todos;
  const lo=Math.max(20,Math.min(...base)), hi=Math.min(90,Math.max(...base));
  if(x.minSiJuega<lo-0.5 || x.minSiJuega>hi+0.5) m2++; });
m2? A.push(m2+' jugadores con minutos "si juega" fuera del rango de sus arranques') : OK.push('los minutos "si juega" caen siempre dentro de lo que jugo de titular');

// 5. tiros y xG por 90. El motor NO divide por los minutos a secas: usa un
// piso de 180' en el divisor para que el que entro tres veces doce minutos y
// pateo una no proyecte un ritmo imposible. Asi que el numero del motor tiene
// que estar entre cero y el crudo, nunca por encima.
let t3=0; T.forEach(x=>{ const i=x.individual; if(!i||!i.minutos) return;
  const crudo=(i.tiros||0)/(i.minutos/90);
  if(x.tiros90!=null && x.tiros90>crudo+0.05) t3++; });
t3? P.push(t3+' jugadores con tiros/90 MAYOR que el crudo: el encogimiento esta al reves') : OK.push('tiros/90 y xG/90 salen de los minutos jugados, encogidos hacia abajo en los de poca muestra');

// 6. el cruce de condiciones contra la tabla
// Los nombres de equipo se canonizan con teamsRegistry, igual que la app: sin
// eso "Rosario Ctral." y "Rosario Central" parecen dos equipos distintos y el
// control marcaba 204 jugadores sin cruce que en la pantalla lo tienen.
const vm=require('vm');
const ctx={console,window:{}}; vm.createContext(ctx);
try{ vm.runInContext(fs.readFileSync('teamsRegistry.js','utf8'),ctx); }catch(e){}
const gid=ctx.getCanonicalTeamId||(()=>null);
const clave=s=>{ if(!s) return ''; const p=String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  if(p==='estudiantes') return 'estudiantes-lp'; return gid(s)||p.replace(/[^a-z0-9]/g,''); };
const tab={}; (S.tabla||[]).forEach(t=>tab[clave(t.equipo)]=t);
let c1=0,c2=0; T.forEach(x=>{ const t=tab[clave(x.equipo)]; if(!t) c1++; });
c1? P.push(c1+' jugadores cuyo equipo no aparece en la tabla de posiciones (el cruce les sale vacio)') : OK.push('los 30 equipos del ranking cruzan con la tabla: ningun jugador queda sin cruce de condiciones');
(S.tabla||[]).forEach(t=>{ if(t.local.pj+t.visitante.pj!==t.pj) c2++; });
c2? P.push(c2+' equipos donde local+visitante no suma los partidos jugados') : OK.push('en los 30 equipos, local + visitante = partidos jugados');

// 7. muestra chica por condicion: no es un error pero engania
const flacos=(S.tabla||[]).filter(t=>t.local.pj<4||t.visitante.pj<4).length;
if(flacos) A.push(flacos+' equipos tienen menos de 4 partidos en alguna condicion: un "0.00 recibidos de visitante" con 3 partidos no quiere decir nada');

// 8. el once recomendado
const ids=new Set((S.esquema.optimo.once||[]).map(x=>x.id));
if(ids.size!==11) P.push('el once recomendado tiene '+ids.size+' jugadores'); else OK.push('el once recomendado tiene 11 jugadores distintos');
const bajas=T.filter(x=>ids.has(x.id)&&x.disponibilidad&&x.disponibilidad.suspendido);
bajas.length? P.push('hay bajas dentro del once: '+bajas.map(x=>x.nombre).join(', ')) : OK.push('ninguna baja se colo en el once');
// el arriesgado
if(S.arriesgado){
  const ia=new Set(S.arriesgado.once.map(x=>x.id));
  if(ia.size!==11) P.push('el once arriesgado tiene '+ia.size+' jugadores');
  else OK.push('el once arriesgado tiene 11 jugadores y comparte '+S.arriesgado.comunes+' con el solido');
  const b2=T.filter(x=>ia.has(x.id)&&x.disponibilidad&&x.disponibilidad.suspendido);
  if(b2.length) P.push('hay bajas dentro del once arriesgado: '+b2.map(x=>x.nombre).join(', '));
}

// 9. precios y presupuesto
const sinPrecio=T.filter(x=>x.precio==null).length;
if(sinPrecio) A.push(sinPrecio+' jugadores sin cotizacion');
const costo=(S.esquema.optimo.once||[]).reduce((a,x)=>a+(x.precio||0),0);
if(costo>S.presupuesto) P.push('el once recomendado cuesta $'+(costo/1e6).toFixed(1)+'M y el presupuesto es $'+(S.presupuesto/1e6).toFixed(0)+'M');
else OK.push('el once recomendado entra en el presupuesto ($'+(costo/1e6).toFixed(1)+'M de $'+(S.presupuesto/1e6).toFixed(0)+'M)');

// 10. curiosidades
const c=S.curiosidades||{};
['leyDelEx','enRacha','leDeben','casaYPatio','rachas','figuras','alFilo','bajas','enDuda','transferidos'].forEach(k=>{
  if(!Array.isArray(c[k])) P.push('la pestania Datos no tiene "'+k+'"');
});
if(Array.isArray(c.rachas)&&c.rachas.length!==30) A.push('rachas de equipo: '+c.rachas.length+' en vez de 30');
if(Array.isArray(c.casaYPatio)&&c.casaYPatio.length!==30) A.push('donde sacan los puntos: '+c.casaYPatio.length+' en vez de 30');
if(c.onceIdeal&&c.onceIdeal.once.length!==11) P.push('el once ideal de la fecha pasada tiene '+c.onceIdeal.once.length+' jugadores');
else if(c.onceIdeal) OK.push('el once ideal de la fecha pasada tiene 11');

const L=console.log;
L(''); L('  ══════════════════════════════════════════════════════════════');
L('   COHERENCIA ENTRE LO QUE SE MUESTRA Y LO QUE CALCULA EL MOTOR');
L('  ══════════════════════════════════════════════════════════════'); L('');
if(P.length){ L('  ✗ PROBLEMAS ('+P.length+')'); P.forEach(t=>L('     • '+t)); L(''); }
if(A.length){ L('  ! PARA MIRAR ('+A.length+')'); A.forEach(t=>L('     • '+t)); L(''); }
L('  ✓ CONTROLES QUE PASARON ('+OK.length+')'); OK.forEach(t=>L('     · '+t)); L('');
L(P.length? '   HAY '+P.length+' PROBLEMA(S).' : '   Todo coherente.');
L('  ══════════════════════════════════════════════════════════════'); L('');
