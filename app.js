'use strict'
//importando librerias
const express = require('express');
const { responseBasic,
    requestURL,
    queryAPI,
    existeIntencion,
    existenParametros,
    generarJWT, verifyToken } = require('./LibDialogFlow');


const app = express();
//configuracion
app.set('port', 8000);
//MIDDLEWARE
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//RUTAS

app.get('/', (req, res) => {
    res.json('Hola desde TraiBot, no es el medio por el que interactuo');
})

app.post('/webhook', (req, res) => {
    let contexto = existeIntencion(req);
    let parametros = existenParametros(req);
    console.log(req.headers);
    console.log(contexto);
    console.log(parametros);
    console.log(req.headers['token']);
    /* if (contexto === 'input.welcome' && req.headers['token'] !== undefined) {
        console.log('No existe token');
        res.json(responseBasic(`Debe autentificarse como usuario valido`));
    } else {


    } */
    switch (contexto) {
        case 'prueba':
            const token = req.headers['token']
            res.json({ contexto, parametros, token });
            break;
        case 'input.welcome':
            let email = parametros.email;
            let pasword = parametros.pasword;
            console.log(`Desde el contexto: ${contexto}`);
            let URI = queryAPI('login', [email, pasword]);
            let usuario = '';
            requestURL(URI).then((data) => {
                /* console.log(data); */
                if (data.success) {
                    let nombre = data.empleado.persona.nombre;
                    let apellidoPaterno = data.empleado.persona.apellido_paterno;
                    let apellidoMaterno = data.empleado.persona.apellido_materno;
                    const usuario = { nombre, apellidoPaterno, apellidoMaterno };
                    res.json(responseBasic(`Bienvenido ${nombre} ${apellidoPaterno} ${apellidoMaterno}`));
                    /*  generarJWT(usuario).then((token) => {
                         console.log(usuario, token);
                          res.setHeader('token', token); 
                          res.append('token', token).json(responseBasic(`Bienvenido ${nombre} ${apellidoPaterno} ${apellidoMaterno}`)); 
                     }); */
                } else {
                    res.json(responseBasic(`Lo siento pero necesito que seas un usuario registrado, apersonate por la Cía.`));
                }
            }).catch((err) => {
                console.log('Ocurrio un error:' + err);
            });
            break;
        case 'CumplimientoMatriz':
            console.log(`Desde el contexto: ${contexto}`);
            res.json(responseBasic(`Estas en:${contexto}`));
            break;
        case 'wellControlHabilitados':
            console.log(`Desde el contexto: ${contexto}`);
            res.json(responseBasic(`Estas en:${contexto}`));
            break;
        case 'cursosProximosAVencerse':
            console.log(`Desde el contexto: ${contexto}`);
            res.json(responseBasic(`Estas en:${contexto}`));
            break;
        case 'conductoresHabilitadosDeshabilitados':
            console.log(`Desde el contexto: ${contexto}`);
            res.json(responseBasic(`Estas en:${contexto}`));
            break;
        case 'cronogramaCapacitacion':
            console.log(`Desde el contexto: ${contexto}`);
            res.json(responseBasic(`Estas en:${contexto}`));
            break;
        case 'historicoCapacitacion':
            console.log(`Desde el contexto: ${contexto}`);
            res.json(responseBasic(`Estas en:${contexto}`));
            break;

        default:
            break;
    }
})

//Poniendo en escucha el servidor
app.listen(app.get('port'), () => {
    console.log(`El servidor esta escuchando en el puerto ${app.get('port')}`)
})