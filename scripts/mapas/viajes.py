import json
A={json.loads(x)['friendly_id']:json.loads(x) for x in open('Bible-Geocoding-Data/data/ancient.jsonl')}
B=json.load(open('/home/claude/kodesh-/biblia-rvr.json'))
def ll(fid):
    p=A[fid]
    for i in p.get('identifications') or []:
        for r in i.get('resolutions',[]):
            if r.get('lonlat'):
                lon,lat=map(float,r['lonlat'].split(',')); return [round(lon,4),round(lat,4)], p['id'], (i.get('score') or {}).get('time_total',0)
    raise Exception(fid)
def S(fid,label,ref,note=''): 
    c,i,conf=ll(fid)
    b,cv=ref.split(' '); ch,v=cv.split(':'); v=v.split('-')[0]
    assert B[b][ch][v], ref
    return {'id':i,'n':label,'ll':c,'r':ref,'note':note,'c':conf}
J=[
 {'id':'abram','t':'El viaje de Abram','ref':'Génesis 11:31 – 12:10','book':'GEN','ch':[11,13],'color':'#c9a84c','stops':[
   S('Ur 1','Ur de los caldeos','GEN 11:31','Taré sale con Abram, Saray y Lot.'),
   S('Haran','Harán','GEN 12:4','Abram parte a los 75 años, como YHWH le dijo.'),
   S('Shechem','Siquem, encina de More','GEN 12:6','YHWH le promete la tierra; Abram edifica un altar.'),
   S('Bethel 1','Entre Betel y Hai','GEN 12:8','Planta su tienda e invoca el nombre de YHWH.'),
   S('Negeb','El Néguev','GEN 12:9','Sigue hacia el sur.'),
   S('Egypt','Egipto','GEN 12:10','Desciende por el hambre en la tierra.')]},
 {'id':'jacob','t':'Jacob: la huida y el regreso','ref':'Génesis 28 – 35','book':'GEN','ch':[28,35],'color':'#d08a5a','stops':[
   S('Beersheba 1','Beerseba','GEN 28:10','Sale de la casa de su padre.'),
   S('Bethel 1','Betel','GEN 28:19','Sueña con la escalera; llama al lugar Betel.'),
   S('Haran','Harán','GEN 29:4','Sirve a Labán; se casa con Lea y Raquel.'),
   S('Mahanaim','Mahanaim','GEN 32:2','Le salen al encuentro ángeles de Elohim.'),
   S('Penuel','Peniel','GEN 32:30','Lucha hasta el alba y recibe el nombre Israel.'),
   S('Succoth 1','Sucot','GEN 33:17','Edifica una casa y cabañas para el ganado.'),
   S('Shechem','Siquem','GEN 33:18','Compra un campo y levanta un altar.'),
   S('Bethel 1','Betel','GEN 35:6','Vuelve a Betel, como Elohim le mandó.'),
   S('Ephrath','Efrata (Belén)','GEN 35:19','Muere Raquel al dar a luz a Benjamín.'),
   S('Hebron','Hebrón (Mamre)','GEN 35:27','Llega a casa de Isaac, su padre.')]},
 {'id':'exodo','t':'El Éxodo','ref':'Éxodo 12 – Josué 6','book':'EXO','ch':[12,19],'color':'#6fa8c9','note':'La ruta es la tradicional; la ubicación de varias paradas del desierto es incierta.','stops':[
   S('Rameses','Ramesés','EXO 12:37','Israel sale de Egipto la noche de Pésaj.'),
   S('Succoth 2','Sucot','EXO 12:37','Primera parada, unos seiscientos mil hombres a pie.'),
   S('Etham','Etam','EXO 13:20','Al borde del desierto; la columna de nube y de fuego.'),
   S('Pi-hahiroth','Pi-hahirot','EXO 14:2','Junto al mar: YHWH abre el camino en medio de las aguas.'),
   S('Marah','Mara','EXO 15:23','Las aguas amargas se vuelven dulces.'),
   S('Elim','Elim','EXO 15:27','Doce fuentes de agua y setenta palmeras.'),
   S('Rephidim','Refidim','EXO 17:1','Agua de la roca; la batalla contra Amalec.'),
   S('Mount Sinai','Monte Sinaí','EXO 19:1','YHWH da la Torá a Israel.'),
   S('Kadesh-barnea','Cades-barnea','NUM 13:26','Vuelven los espías; cuarenta años en el desierto.'),
   S('Mount Hor 1','Monte Hor','NUM 20:22','Muere Aarón.'),
   S('Mount Nebo','Monte Nebo','DEU 34:1','Moisés ve la tierra prometida.'),
   S('Jericho 1','Jericó','JOS 6:20','Caen los muros; Israel entra en la tierra.')]},
 {'id':'jonas','t':'Jonás','ref':'Jonás 1 – 3','book':'JON','ch':[1,4],'color':'#7fb07a','stops':[
   S('Joppa','Jope','JON 1:3','Jonás huye en una nave hacia Tarsis.'),
   S('Nineveh','Nínive','JON 3:3','Predica, y la ciudad se arrepiente.')]},
 {'id':'nino','t':'La niñez de Yeshúa','ref':'Lucas 2 · Mateo 2','book':'MAT','ch':[2,2],'color':'#c9a84c','stops':[
   S('Nazareth','Nazaret','LUK 2:4','José y Miriam suben a empadronarse.'),
   S('Bethlehem 1','Belén','LUK 2:7','Nace Yeshúa.'),
   S('Egypt','Egipto','MAT 2:14','Huyen de Herodes.'),
   S('Nazareth','Nazaret','MAT 2:23','Vuelven y viven en Nazaret.')]},
 {'id':'pablo1','t':'Primer viaje de Pablo','ref':'Hechos 13 – 14','book':'ACT','ch':[13,14],'color':'#c9a84c','pablo':1,'stops':[
   S('Antioch 1','Antioquía de Siria','ACT 13:1','La congregación aparta a Bernabé y a Saulo.'),
   S('Seleucia','Seleucia','ACT 13:4','Se embarcan hacia Chipre.'),
   S('Salamis','Salamina','ACT 13:5','Anuncian la palabra en las sinagogas.'),
   S('Paphos','Pafos','ACT 13:6','El procónsul Sergio Paulo cree.'),
   S('Perga','Perge','ACT 13:13','Juan Marcos se vuelve a Jerusalén.'),
   S('Antioch 2','Antioquía de Pisidia','ACT 13:14','Predicación en la sinagoga en Shabat.'),
   S('Iconium','Iconio','ACT 14:1','Muchos judíos y griegos creen.'),
   S('Lystra','Listra','ACT 14:8','Sana a un cojo; luego apedrean a Pablo.'),
   S('Derbe','Derbe','ACT 14:20','Hacen muchos discípulos.'),
   S('Attalia','Atalia','ACT 14:25','Se embarcan de regreso.'),
   S('Antioch 1','Antioquía de Siria','ACT 14:26','Cuentan cómo se abrió la puerta de la fe a las naciones.')]},
 {'id':'pablo2','t':'Segundo viaje de Pablo','ref':'Hechos 15:36 – 18:22','book':'ACT','ch':[15,18],'color':'#d08a5a','pablo':2,'stops':[
   S('Antioch 1','Antioquía de Siria','ACT 15:40','Pablo sale con Silas.'),
   S('Derbe','Derbe','ACT 16:1','Visitan las congregaciones.'),
   S('Lystra','Listra','ACT 16:1','Timoteo se une al viaje.'),
   S('Troas','Troas','ACT 16:8','La visión del varón macedonio.'),
   S('Samothrace','Samotracia','ACT 16:11','Navegan hacia Macedonia.'),
   S('Neapolis','Neápolis','ACT 16:11','Llegan a Europa.'),
   S('Philippi','Filipos','ACT 16:12','Lidia cree; Pablo y Silas cantan en la cárcel.'),
   S('Amphipolis','Anfípolis','ACT 17:1','De paso.'),
   S('Apollonia','Apolonia','ACT 17:1','De paso.'),
   S('Thessalonica','Tesalónica','ACT 17:1','Tres Shabat en la sinagoga; alboroto.'),
   S('Berea','Berea','ACT 17:10','Escudriñan las Escrituras cada día.'),
   S('Athens','Atenas','ACT 17:15','Discurso en el Areópago: «al Dios no conocido».'),
   S('Corinth','Corinto','ACT 18:1','Año y medio con Aquila y Priscila.'),
   S('Cenchreae','Cencrea','ACT 18:18','Pablo se rapa la cabeza por un voto.'),
   S('Ephesus','Éfeso','ACT 18:19','Habla en la sinagoga; promete volver.'),
   S('Caesarea','Cesarea','ACT 18:22','Desembarca y sube a saludar a la congregación.'),
   S('Antioch 1','Antioquía de Siria','ACT 18:22','Regresa a Antioquía.')]},
 {'id':'pablo3','t':'Tercer viaje de Pablo','ref':'Hechos 18:23 – 21:17','book':'ACT','ch':[18,21],'color':'#6fa8c9','pablo':3,'stops':[
   S('Antioch 1','Antioquía de Siria','ACT 18:23','Recorre Galacia y Frigia confirmando a los discípulos.'),
   S('Ephesus','Éfeso','ACT 19:1','Dos años enseñando; el alboroto de los plateros.'),
   S('Troas','Troas','ACT 20:6','Eutico cae de la ventana y vuelve a la vida.'),
   S('Assos','Asón','ACT 20:13','Pablo va a pie; los demás por mar.'),
   S('Mitylene','Mitilene','ACT 20:14','Navegan junto a la costa.'),
   S('Chios','Quío','ACT 20:15','De paso.'),
   S('Samos','Samos','ACT 20:15','De paso.'),
   S('Miletus','Mileto','ACT 20:17','Se despide de los ancianos de Éfeso.'),
   S('Cos','Cos','ACT 21:1','De paso.'),
   S('Rhodes 1','Rodas','ACT 21:1','De paso.'),
   S('Patara','Pátara','ACT 21:1','Cambian de nave.'),
   S('Tyre','Tiro','ACT 21:3','Siete días con los discípulos.'),
   S('Ptolemais','Tolemaida','ACT 21:7','Saludan a los hermanos.'),
   S('Caesarea','Cesarea','ACT 21:8','En casa de Felipe; profecía de Agabo.'),
   S('Jerusalem','Jerusalén','ACT 21:17','Los hermanos lo reciben con gozo.')]},
 {'id':'pablo4','t':'Viaje de Pablo a Roma','ref':'Hechos 27 – 28','book':'ACT','ch':[27,28],'color':'#a98fd1','pablo':4,'stops':[
   S('Caesarea','Cesarea','ACT 27:1','Pablo sale preso hacia Italia.'),
   S('Sidon','Sidón','ACT 27:3','Julio le permite visitar a sus amigos.'),
   S('Myra','Mira','ACT 27:5','Cambian a una nave de Alejandría.'),
   S('Cnidus','Gnido','ACT 27:7','El viento no los deja avanzar.'),
   S('Fair Havens','Buenos Puertos','ACT 27:8','Pablo advierte del peligro.'),
   S('Malta','Malta','ACT 28:1','Naufragio; la víbora no le hace daño.'),
   S('Syracuse','Siracusa','ACT 28:12','Tres días.'),
   S('Rhegium','Regio','ACT 28:13','De paso.'),
   S('Puteoli','Puteoli','ACT 28:13','Siete días con los hermanos.'),
   S('Forum of Appius','Foro de Apio','ACT 28:15','Los hermanos salen a recibirlo.'),
   S('Three Taverns','Tres Tabernas','ACT 28:15','Pablo da gracias y cobra aliento.'),
   S('Rome','Roma','ACT 28:16','Dos años predicando el Reino.')]},
]
json.dump({'src':'Ubicaciones: OpenBible.info (CC BY 4.0)','j':J},open('/home/claude/kodesh-/data/viajes.json','w'),ensure_ascii=False,separators=(',',':'))
print('ok',[(j['id'],len(j['stops']),min(s['c'] for s in j['stops'])) for j in J])
