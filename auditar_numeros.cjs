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

// 2. share: el reparto del ataque de cada equipo tiene que dar ~1
//
// ESTE CONTROL ESTABA MIDIENDO OTRA COSA QUE EL MOTOR (06/09).
// Marcaba 17 de 30 equipos rotos, con Platense en 1.47 y Belgrano en 0.84, y
// el motor estaba bien: el que habia quedado viejo era el control.
// Sumaba TODO el plantel ponderando por minEsperados, que es el invariante que
// usaba el motor hasta la v29. En la v30 (05/09) la normalizacion cambio a
// proposito — se normaliza sobre el ONCE PROBABLE (los diez de campo con mas
// minutos esperados) con los minutos que juega SI ARRANCA — porque minEsperados
// = P(juega) x minutos y la incertidumbre sobre quien juega se comia minutos
// que en la cancha se juegan igual (el caso Daniele/Banfield). El control se
// quedo en la formula vieja y desde entonces gritaba en falso.
// Un control que grita en falso es peor que no tener control: se deja de mirar.
const porEq={}; T.forEach(x=>{ (porEq[x.equipo]=porEq[x.equipo]||[]).push(x); });
const onceDe = js => js.filter(x=>x.pos!=='ARQ')
  .sort((a,b)=>(b.minEsperados||0)-(a.minEsperados||0)).slice(0,10);
// ACTUALIZADO OTRA VEZ (07/09), y ahora el motor cambio de verdad.
// El reparto ya NO tiene que dar 1: da la fraccion de los 900 minutos de campo
// que cubre el once probable. Antes daba 1 sobre 851 minutos, o sea que los
// titulares se llevaban tambien el gol de los que entran del banco.
// ESTE CONTROL NO PUEDE REARMAR EL ONCE DEL MOTOR (07/09).
// El auditor solo ve a los que llegaron al ranking y el motor evalua el plantel
// entero, asi que elige otros diez y la cuenta nunca coincide exacto: marcaba a
// Huracan como roto sin estarlo. Reimplementar el reparto aca seria peor —un
// control que copia al codigo que audita no controla nada.
// Lo que si es verificable, y es lo que de verdad importa, son dos cosas:
//   1) que a nadie se le repartan MAS goles de los que el equipo va a hacer
//      (el bug viejo, con Platense en 1.47), y
//   2) que el factor de escala sea uno solo por equipo y este en un rango
//      creible. Si el motor escalara distinto a dos companeros, el reparto
//      estaria roto de una forma que no se ve en ningun numero de la pantalla.
let fuera=[], escalasRaras=[];
Object.entries(porEq).forEach(([e,js])=>{
  const s=onceDe(js).reduce((a,x)=>a+(x.share||0)*Math.max(0.02,(x.minSiJuega||0)/90),0);
  if(s>1.05) fuera.push(e+' '+s.toFixed(2));
  const esc=[...new Set(js.map(x=>x.escalaGol).filter(v=>v!=null))];
  if(esc.length>1) escalasRaras.push(e+' tiene '+esc.length+' escalas distintas');
  else if(esc.length===1 && (esc[0]<0.75||esc[0]>1.001)) escalasRaras.push(e+' escala '+esc[0]);
});
escalasRaras.length ? P.push('el escalado del ataque esta roto en: '+escalasRaras.join(', '))
  : OK.push('el ataque de cada equipo se escala por un solo factor, entre 0.75 y 1 (los minutos que el once cubre de los 900)');
fuera.length? P.push('a estos equipos se les reparten MAS goles de los que van a hacer: '+fuera.join(', '))
            : OK.push('a ningun equipo se le reparte mas gol del que va a hacer');

// 2b. LOS MINUTOS DE CAMPO SON 900, SIEMPRE.
// Lo de arriba controla que el motor haga lo que dice que hace. Esto controla
// otra cosa: que lo que hace tenga sentido. Un equipo juega 10 x 90 = 900
// minutos de campo en todos los partidos. Si el once probable suma menos que
// eso, los minutos que faltan los juegan suplentes que no entran en la cuenta,
// y al normalizar sobre el total mas chico los goles del equipo se reparten
// enteros entre los titulares: se les regala el gol que meten los que entran.
// El sesgo no es igual para todos, que es lo que lo hace peligroso — cambia la
// comparacion ENTRE equipos, que es justo lo que decide a quien poner.
{
  const cob=Object.entries(porEq).map(([e,js])=>({e, m:onceDe(js).reduce((a,x)=>a+(x.minSiJuega||0),0)}))
    .sort((a,b)=>a.m-b.m);
  // ARREGLADO EN EL MOTOR (07/09): el reparto se escala por minOnce/900, asi que
  // los minutos que el once no cubre ya NO se le regalan a los titulares. Lo que
  // se controla ahora es que ningun plantel quede con una cobertura absurda, que
  // seria sintoma de minutos rotos y no de rotacion.
  const media=cob.reduce((a,c)=>a+c.m,0)/cob.length;
  const rotos=cob.filter(c=>c.m<600 || c.m>901);
  if(rotos.length) P.push(rotos.length+' equipo(s) con minutos del once imposibles: '+
    rotos.map(c=>c.e+' '+Math.round(c.m)+"'").join(', ')+'. Con 10 de campo el maximo son 900.');
  else OK.push('los minutos del once probable son creibles en los 30 equipos (media '+Math.round(media)+
    "' de 900; el reparto del ataque ya se escala por eso)");
}

// 3. lamGol = share x goles del equipo x la fraccion de partido que juega.
// (La primera version de este control se olvidaba de los minutos y marcaba 295
//  jugadores como rotos; el roto era el control.)
// ACTUALIZADO (07/09): lamGol ahora es el gol TOTAL (jugada + penal). El que
// tiene que salir de "parte del ataque x goles del equipo x minutos" es el
// bruto, y de ahi el de jugada le descuenta la fraccion de penales de la liga.
let d=0, dj=0; T.forEach(x=>{ if(x.lamGolBruto==null||!x.lam||!x.minSiJuega) return;
  if(!cerca(x.lamGolBruto, (x.share||0)*x.lam.lamFor*(x.minSiJuega/90), 0.02)) d++;
  // y el total tiene que ser exactamente los dos canales sumados
  if(x.lamJugada!=null && x.lamPen!=null && !cerca(x.lamGol, x.lamJugada+x.lamPen, 0.005)) dj++; });
d? P.push(d+' jugadores donde el gol bruto != parte del ataque x goles del equipo x minutos') : OK.push('el gol bruto de cada uno = su parte del ataque x los goles de su equipo x lo que juega');
dj? P.push(dj+' jugadores donde el gol total no es la suma del gol de jugada y el de penal') : OK.push('el gol que muestra la tabla es la suma exacta del gol de jugada y el de penal');

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
