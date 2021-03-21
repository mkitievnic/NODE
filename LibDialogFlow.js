const { resolve } = require("path");
const http = require('http');
//const jwt = require('jsonwebtoken');
const { response, request } = require("express");


/**
 * Make a basic response about a text received
 * @param {*} message
 * @returns Return a JSON string
 */
function responseBasic(message) {
  let formatDialogFlow = {
    "fulfillmentMessages": [
      {
        "text": {
          "text": [
            message
          ]
        },
        "platform": "FACEBOOK"
      },
      {
        "text": {
          "text": [
            message
          ]
        }
      }
    ]
  }
  return formatDialogFlow;
}
//Function requests URL for API externs
function requestURL(URI) {
  return new Promise((response, reject) => {

    console.log(URI);
    http.get(URI, (dataResponse) => {
      let responseData = '';
      let responseJSON = '';
      dataResponse.on('data', (chunk) => {
        responseData += chunk;
      });
      dataResponse.on('end', () => {
        try {
          responseJSON = JSON.parse(responseData);

        } catch (err) {
          console.log('Ha ocurrido un error en los datos del API A JSON' + err);
          reject(new Error("Ha ocurrido un error al cargar los datos de API A JSON"));
        }
        response(responseJSON);
      }).on('error', (err) => {
        console.log('Ha ocurrido un error en los datos del API A JSON' + err);
      })

    }).on('error', (err) => {
      console.log('Ha ocurrido un error en la lectura de la API' + err);
    });

  })

}
/**
 * 
 * @param {*} ruta , referido al direccion URL a solicitar informacion. 
 * @param {*} params los parametros necesarios para la consulta http
 */
function queryAPI(ruta = '', params = []) {
  switch (ruta) {
    case 'proximo-vencerse':
      URL = `http://sanantoniotraining.herokuapp.com/api/${ruta}?gestion=${params[0]}&legajo=${params[1]}`;
      break;
    case 'seguimiento':
      URL = `http://sanantoniotraining.herokuapp.com/api/${ruta}?gestion=${params[0]}&legajo=${params[1]}`;
      break;
    case 'conductores-habilitados':
      URL = `http://sanantoniotraining.herokuapp.com/api/${ruta}?legajo=${params[0]}`;
      break;
    case 'personal-well-control':
      URL = `http://sanantoniotraining.herokuapp.com/api/${ruta}?legajo=${params[0]}`;
      break;
    case 'get-evento':
      URL = `http://sanantoniotraining.herokuapp.com/api/${ruta}/${params[0]}`;
      break;
    case 'historico-capacitacion':
      URL = `http://sanantoniotraining.herokuapp.com/api/${ruta}?legajo=${params[0]}`;
      break;
    case 'programa-capacitacion':
      URL = `http://sanantoniotraining.herokuapp.com/api/${ruta}/${params[0]}?txtEstado=${params[1]}`;
      break;
    case 'login':
      URL = `http://sanantoniotraining.herokuapp.com/api/${ruta}/${params[0]}/${params[1]}`;
      break;
    default:
      URL = '';
      break;
  }
  return URL;
}
//retorna el nombre de la intencion
function existeIntencion(data) {
  try {
    let cont = data.body.queryResult.action;
    return cont;
  } catch (error) {
    console.log(`Ocurrio un error al obtener los daotos ${error}`);
  }
}
//retorna los parametros si existen
function existenParametros(data) {
  try {
    let params = data.body.queryResult.parameters;
    return params;
  } catch (error) {
    console.log(`No existen parámetros ${error}`);
  }
}
//generador de jwt
const generarJWT = (uid = '') => {
  return new Promise((resolve, reject) => {
    const payload = { uid };
    jwt.sign(payload, 'achuquisaquenizada1977', {
      expiresIn: '30s'
    }, (err, token) => {
      if (err) {
        console.log(err);
        reject('No se puede generar el token')
      } else {
        resolve(token);
      }
    });
  })
}
//verificar token
const verifyToken = (req = request, res = response, next) => {
  const token = req.headers['token'];
  if (token) {
    console.log(token);
    next();
  } else {
    console.log('NO existe token');
  }
}
//Funcion para formatear texto.
const eliminarItalicas = (word = '') => {
  if (word !== '') {
    word = word.replace('<i>', '');
    word = word.replace('<br>', '');
    word = word.replace('</i>', '');
    word = word.replace("<span style='color: red'>", '');
    word = word.replace("</span>", '');
    return word;
  }
  return;
}

module.exports = {
  responseBasic,
  requestURL,
  queryAPI,
  existeIntencion,
  existenParametros,
  generarJWT,
  verifyToken,
  eliminarItalicas
}