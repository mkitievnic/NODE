//libraries
const express = require("express");
const router = express.Router();
const request = require("request");
const uuid = require("uuid");
const axios = require("axios");
const moment = require('moment');
//files
const config = require("../config");
const dialogflow = require("../dialogflow");
const { structProtoToJson } = require("./helpers/structFunctions");
const { requestURL, queryAPI, eliminarItalicas } = require('../LibDialogFlow');
//mongodb models
const ChatbotUser = require("../Models/ChatbotUsers");
const Product = require("../Models/Products");
const { findOne } = require("../Models/ChatbotUsers");

// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
  throw new Error("missing FB_PAGE_TOKEN");
}
if (!config.FB_VERIFY_TOKEN) {
  throw new Error("missing FB_VERIFY_TOKEN");
}
if (!config.GOOGLE_PROJECT_ID) {
  throw new Error("missing GOOGLE_PROJECT_ID");
}
if (!config.DF_LANGUAGE_CODE) {
  throw new Error("missing DF_LANGUAGE_CODE");
}
if (!config.GOOGLE_CLIENT_EMAIL) {
  throw new Error("missing GOOGLE_CLIENT_EMAIL");
}
if (!config.GOOGLE_PRIVATE_KEY) {
  throw new Error("missing GOOGLE_PRIVATE_KEY");
}
if (!config.FB_APP_SECRET) {
  throw new Error("missing FB_APP_SECRET");
}

const sessionIds = new Map();

// for Facebook verification
router.get("/webhook/", function (req, res) {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === config.FB_VERIFY_TOKEN
  ) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

//for webhook facebook
router.post("/webhook/", function (req, res) {
  var data = req.body;
  // Make sure this is a page subscription
  if (data.object == "page") {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function (pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function (messagingEvent) {
        if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else {
          console.log(
            "Webhook received unknown messagingEvent: ",
            messagingEvent
          );
        }
      });
    });

    // Assume all went well.
    // You must send back a 200, within 20 seconds
    res.sendStatus(200);
  }
});

async function receivedMessage(event) {
  var senderId = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;
  console.log(
    "Received message for user %d and page %d at %d with message:",
    senderId,
    recipientID,
    timeOfMessage
  );

  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;

  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var quickReply = message.quick_reply;

  if (isEcho) {
    handleEcho(messageId, appId, metadata);
    return;
  } else if (quickReply) {
    handleQuickReply(senderId, quickReply, messageId);
    return;
  }
  saveUserData(senderId);

  if (messageText) {
    //send message to dialogflow
    console.log("MENSAJE DEL USUARIO: ", messageText);
    await sendToDialogFlow(senderId, messageText);
  } else if (messageAttachments) {
    handleMessageAttachments(messageAttachments, senderId);
  }
}

async function saveUserData(facebookId) {
  console.log('Facebook Id:', facebookId);

  //console.log(findOne);
  let faceUser = await ChatbotUser.findOne({ facebookId });
  /* console.log(faceUser); */
  if (faceUser) return console.log('El usuario ya existe', faceUser);
  //if (isRegistered) return;
  let userData = await getUserData(facebookId);
  console.log(userData);
  let chatbotUser = new ChatbotUser({
    firstName: userData.first_name,
    lastName: userData.last_name,
    facebookId,
    profilePic: userData.profile_pic,
    time: moment().format()
  });
  chatbotUser.save((err, res) => {
    if (err) return console.log(err);
    console.log("Se creo un usuario:", res);
  });
}

function handleMessageAttachments(messageAttachments, senderId) {
  //for now just reply
  sendTextMessage(senderId, "Archivo adjunto recibido... gracias! .");
}

async function setSessionAndUser(senderId) {
  try {
    if (!sessionIds.has(senderId)) {
      sessionIds.set(senderId, uuid.v1());
    }
  } catch (error) {
    throw error;
  }
}

async function handleQuickReply(senderId, quickReply, messageId) {
  let quickReplyPayload = quickReply.payload;
  console.log(
    "Quick reply for message %s with payload %s",
    messageId,
    quickReplyPayload
  );
  //this.elements = a;
  // send payload to api.ai
  sendToDialogFlow(senderId, quickReplyPayload);
}

async function handleDialogFlowAction(
  sender,
  action,
  messages,
  contexts,
  parameters
) {
  switch (action) {
    //Inicio de conversacion con el bot y indica que usuario de facebook es
    case "input.welcome":
      await sendTextMessage(sender, "BIENVENIDOS A SAN ANTONIO");
      await sendGenericMessage(sender, [
        {
          "buttons": [
            {
              "title": "Autentificarse",
              "payload": "AUTENTIFICARSE_PAYLOAD",
              "type": "postback"
            }
          ],
          "title": "AUTENTIFICACION DEL USUARIO",
          "image_url": "https://news.sophos.com/wp-content/uploads/2016/06/autentificacion.gif",
          "subtitle": "Debe estar dado de alta como usuario."
        }
      ]);

      /* await sendTextMessage(sender, "Escribe tu email y contrase??a."); */
      break;
    //Me muestra tarjeta para autentificar usuario Management Trainning System
    case "autentificacion":
      await sendTextMessage(sender, '{first_name} {last_name}, coloca tu correo electr??nico y contrase??a por favor.');
      let infomationUser = await getUserData(sender);
      await sendImageMessage(sender, infomationUser.profile_pic);
      break;
    //Solicita los parametros para autentificarse como usuario M.T.S.
    case "autentificacionParametros":
      console.log(parameters);
      let email = parameters.fields.email.stringValue;
      let pasword = parameters.fields.pasword.stringValue;
      console.log(email, ' ', pasword);
      //obtener los registros
      let path = queryAPI('login', [email, pasword]);
      console.log(path);
      let usuario = await requestURL(path);
      console.log(usuario);
      if (usuario.success && usuario.empleado.alta) {
        let nombreUsuario = usuario.empleado.persona.nombre;
        let apellidoPaterno = usuario.empleado.persona.apellido_paterno;
        let apellidoMaterno = usuario.empleado.persona.apellido_materno;
        let funcion = usuario.empleado.persona.funcion.nombre;
        let legajo = usuario.empleado.persona.legajo;
        let userChange = await ChatbotUser.findOneAndUpdate(sender, { legajo });
        console.log('USUARIO CAMBIADO:', userChange);
        let message = `USUARIO REGISTRADO - SAN ANTONIO \n
          NOMBRE COMPLETO: ${nombreUsuario} ${apellidoPaterno} ${apellidoMaterno}\n
          FUNCION: ${funcion}
          `;
        await sendTextMessage(sender, message);
        await sendGenericMessage(sender, [
          {
            "buttons": [
              {
                "title": "Ver Informes",
                "payload": "INFORMES_PAYLOAD_291277",
                "type": "postback"
              }
            ],
            "title": "INFORMES DE CAPACITACION",
            "image_url": "https://www.egosbi.com/wp-content/uploads/2020/04/facebook_insights_reporting_gds-1080x675-1.png",
            "subtitle": "Informes de capacitaci??n."
          },
          {
            "buttons": [
              {
                "title": "Ver Preguntas",
                "payload": "FAQ_PAYLOAD",
                "type": "postback"
              }
            ],
            "title": "PREGUNTAS FRECUENTES - F.A.Q.",
            "image_url": "https://image.freepik.com/vector-gratis/grupo-personas-iconos-signo-interrogacion_53876-64627.jpg",
            "subtitle": "F.A.Q. de procesamiento capacitaci??n."
          }
        ]);

      } else {
        await sendTextMessage(sender, '{first_name} {last_name}, USUARIO NO REGISTRADO O DADO DE ALTA.');
        await sendImageMessage(sender, 'https://kinsta.com/es/wp-content/uploads/sites/8/2020/06/error-401.jpg');

      }
      break;
    //Muestra todas las tarjetas de cada uno de los informes
    case "informes":
      await sendGenericMessage(sender, [
        {
          "buttons": [
            {
              "title": "Mostrar Informacion",
              "payload": "CURSOS PROXIMOS A VENCERSE",
              "type": "postback"
            }
          ],
          "title": "CURSOS PROXIMOS A VENCERSE",
          "image_url": "https://economipedia.com/wp-content/uploads/Fecha-de-vencimiento-1.png",
          "subtitle": "Cursos proximos a vencerse."
        },
        {
          "subtitle": "Cumplimiento de matriz de capacitaci??n",
          "title": "CUMPLIMIENTO DE MATRIZ",
          "buttons": [
            {
              "payload": "MATRIZ_DE_CAPACITACION",
              "type": "postback",
              "title": "Mostrar Informacion"
            }
          ],
          "image_url": "https://image.freepik.com/vector-gratis/concepto-examen-linea-pruebas-linea-formulario-cuestionario-educacion-linea-encuesta-cuestionario-internet-ilustracion-vectorial-isometrica_159446-22.jpg"
        },
        {
          "subtitle": "Habilitacion de Manejo Defensivo Inteligente",
          "image_url": "https://image.freepik.com/vector-gratis/curso-conduccion-isometrica_30590-103.jpg",
          "title": "CERTIFICACION DE CONDUCCION",
          "buttons": [
            {
              "title": "Mostrar Informacion",
              "payload": "CONDUCTORES_HABILITADOS",
              "type": "postback"
            }
          ]
        },
        {
          "buttons": [
            {
              "payload": "WELL CONTROL SCHOOL",
              "title": "Mostrar Informaci??n",
              "type": "postback"
            }
          ],
          "title": "WELL CONTROL SCHOOL",
          "subtitle": "Certificacion de Control de Pozos.",
          "image_url": "https://www.drillingcontractor.org/wp-content/uploads/2017/03/well-control-school-thumbnail.png"
        },
        {
          "image_url": "https://www.acceseo.com/wp-content/uploads/2019/09/como-organizar-un-evento.png",
          "buttons": [
            {
              "type": "postback",
              "payload": "INFORMACION DEL EVENTO",
              "title": "Mostrar Informaci??n"
            }
          ],
          "title": "INFORMACION DE UN EVENTO",
          "subtitle": "Informaci??n del evento a asistir."
        },
        {
          "image_url": "https://image.freepik.com/vector-gratis/concepto-cursos-linea_23-2148533386.jpg",
          "buttons": [
            {
              "type": "postback",
              "title": "Mostrar Informaci??n",
              "payload": "HISTORICO DE CAPACITACION"
            }
          ],
          "title": "HISTORICO DE CAPACITACION",
          "subtitle": "Todos los cursos realizados a la fecha."
        },
        {
          "title": "CRONOGRAMA DE CAPACITACI??N",
          "image_url": "https://luna1.co/9229bd.png",
          "buttons": [
            {
              "payload": "CRONOGRAMA DE CAPACITACION",
              "title": "Mostrar Informaci??n",
              "type": "postback"
            }
          ],
          "subtitle": "Eventos(cursos), realizados o programados."
        }
      ]);
      break;
    //Solicita el parametro de gestion para reporte de cumplimiento de matriz
    case "CumplimientoMatrizParametros":
      console.log(parameters, ' PARAMETROS');
      //solicitar el parametro gestion
      let gestion = parameters.fields.gestion.numberValue;
      console.log('GESTION!!!:', gestion);
      //obteniendo legajo
      console.log(sender);
      let user = await ChatbotUser.findOne({ facebookId: sender }).lean();
      console.log(user);
      console.log('LEGA:', user.legajo);
      //obtener los registros
      let ruta = queryAPI('seguimiento', [gestion.toString(), user.legajo]);
      console.log(ruta);
      let data = await requestURL(ruta);
      let resultComplete = '';
      console.log(data.cursos);
      if (data.success && data.cursos.length !== 0) {
        resultComplete = `MATRIZ DE SEGUIMIENTO INDIVIDUAL - GESTION ${data.gestion}\nLegajo-Nombre Completo: ${data.empleados}\nMATRIZ INDIVIDUAL:\n`;
        data.cursos.forEach(element => {
          resultComplete += `${element.curso}:${eliminarItalicas(element.value)}\n`;
        });

      } else {
        resultComplete = '*NO EXISTE INFORMACION - MATRIZ DE SEGUIMIENTO.*';
      }
      console.log(resultComplete);
      await sendTextMessage(sender, resultComplete);
      break;
    //Inicia interaccion con el reporte de cumplimiento de matriz
    case "CumplimientoMatriz":
      await sendTextMessage(sender, 'Escribe de la gesti??n por favor (2000,2001,etc.): ');
      break;
    //Inicia interaccion con reporte proximo a vencerse
    case "cursosProximosAVencerse":
      await sendTextMessage(sender, 'Escribe de la gesti??n por favor (2000,2001,etc.): ');
      break;
    case "parametroCursoProximoAVencerse":
      console.log(parameters, ' PARAMETROS');
      //solicitar el parametro gestion
      let gestProxVenc = parameters.fields.gestion.numberValue;
      console.log('GESTION!!!:', gestProxVenc);
      //obteniendo legajo
      console.log(sender);
      let userProxVenc = await ChatbotUser.findOne({ facebookId: sender }).lean();
      console.log(userProxVenc);
      console.log('LEGA:', userProxVenc.legajo);
      //obtener los registros
      let rutaProxVenc = queryAPI('proximo-vencerse', [gestProxVenc.toString(), userProxVenc.legajo]);
      console.log(rutaProxVenc);
      let dataProxVenc = await requestURL(rutaProxVenc);
      let resultCompleteProxVenc = '';
      console.log(dataProxVenc.cursos);
      if (dataProxVenc.success && dataProxVenc.cursos.length !== 0) {
        resultCompleteProxVenc = `CURSOS PROXIMOS A VENCERSE INDIVIDUAL - GESTION ${dataProxVenc.gestion}\nLegajo-Nombre Completo: ${dataProxVenc.empleado}\nMATRIZ INDIVIDUAL:\n`;
        dataProxVenc.cursos.forEach(element => {
          resultCompleteProxVenc += `${element.curso}:${eliminarItalicas(element.value)}\n`;
        });

      } else {
        resultCompleteProxVenc = 'NO EXISTE INFORMACION - CURSOS PROXIMOS A VENCERSE';
      }
      console.log(resultCompleteProxVenc);
      await sendTextMessage(sender, resultCompleteProxVenc);
      break;
    //Muestra reporte well control
    case "wellControlHabilitados":
      //obteniendo legajo
      console.log(sender);
      let userWell = await ChatbotUser.findOne({ facebookId: sender }).lean();
      console.log(userWell);
      console.log('LEGA:', userWell.legajo);
      //obtener los registros
      let rutaWell = queryAPI('personal-well-control', [userWell.legajo]);
      console.log(rutaWell);
      let dataWell = await requestURL(rutaWell);
      let resultCompleteWell = '';
      console.log(dataWell.participantes);
      if (dataWell.success && dataWell.participantes.length !== 0) {
        resultCompleteWell = `WELL CONTROL HABILITADO DESHABILITADO INDIVIDUAL\n`;
        dataWell.participantes.forEach(element => {
          resultCompleteWell += `GESTION: ${element.gestion}\n NOTA:${element.final}\n
          APROBADO:${element.final > 74}`;
        });

      } else {
        resultCompleteWell = 'NO EXISTE INFORMACION - WELL CONTROL HABILITADOS Y DESHABILITADOS';
      }
      console.log(resultCompleteWell);
      await sendTextMessage(sender, resultCompleteWell);
      break;
    //Muestra con reporte conductores habilitados
    case "conductoresHabilitadosDeshabilitados":
      //obteniendo legajo
      console.log(sender);
      let userCondHabVenc = await ChatbotUser.findOne({ facebookId: sender }).lean();
      console.log(userCondHabVenc);
      console.log('LEGA:', userCondHabVenc.legajo);
      //obtener los registros
      let rutaCondHabVenc = queryAPI('conductores-habilitados', [userCondHabVenc.legajo]);
      console.log(rutaCondHabVenc);
      let dataCondHabVenc = await requestURL(rutaCondHabVenc);
      let resultCompleteCondHabVenc = '';
      console.log(dataCondHabVenc.empleados);
      if (dataCondHabVenc.success && dataCondHabVenc.empleados.length !== 0) {
        resultCompleteCondHabVenc = `CONDUCTOR HABILITADO DESHABILITADO INDIVIDUAL\n`;
        dataCondHabVenc.empleados.forEach(element => {
          resultCompleteCondHabVenc += `legajo: ${element.legajo}\n nombre:${element.nombre}\n
          Funcion:${element.funcion}\n Manejo Defensivo:${element['Manejo defensivo']}\n
          Montacarga: ${element.Montacarga}\n
          Grua:${element.grua}`;
        });

      } else {
        resultCompleteCondHabVenc = 'NO EXISTE INFORMACION - CONDUCTORES HABILITADOS Y DESHABILITADOS';
      }
      console.log(resultCompleteCondHabVenc);
      await sendTextMessage(sender, resultCompleteCondHabVenc);
      break;
    //Mostrar informacion del reporte cronograma
    case "cronogramaCapacitacion":
      await sendTextMessage(sender, 'Escribe de la gesti??n por favor (2000,2001,etc.): ');
      break;
    case "parametroCronograma":
      console.log(parameters, ' PARAMETROS');
      //solicitar el parametro gestion
      let gestCron = parameters.fields.gestion.numberValue;
      console.log('GESTION!!!:', gestCron);
      console.log(sender);
      //obtener los registros
      let rutaCron = queryAPI('programa-capacitacion', [gestCron.toString()]);
      console.log(rutaCron);
      let dataCron = await requestURL(rutaCron);
      let resultCompleteCron = '';
      console.log(dataCron.eventos);
      if (dataCron.success && dataCron.eventos.length !== 0) {
        resultCompleteCron = `CRONOGRAMA DE EVENTOS - GESTION ${dataCron.gestion}\n`;
        dataCron.eventos.forEach(element => {
          resultCompleteCron += `\nINICIA:${element.inicia}\nTERMINA:${element.termina}\nCURSO:${element.curso}\nINSTRUCTOR:${element.instructor}\nESTADO:${element["estado "]}\n`;
        });

      } else {
        resultCompleteCron = 'NO EXISTE INFORMACION - CRONOGRAMA';
      }
      console.log(resultCompleteCron);
      await sendTextMessage(sender, resultCompleteCron);
      break;
    //Muestra informe de historico de capacitacion
    case "historicoCapacitacion":
      console.log(sender);
      let userHist = await ChatbotUser.findOne({ facebookId: sender }).lean();
      console.log(userHist);
      console.log('LEGA:', userHist.legajo);
      //obtener los registros
      let rutaHist = queryAPI('historico-capacitacion', [userHist.legajo]);
      console.log(rutaHist);
      let dataHist = await requestURL(rutaHist);
      let resultCompleteHist = '';
      console.log(dataHist);
      if (dataHist.success && dataHist.participantes.length !== 0) {
        resultCompleteHist = `HISTORICO DE CAPACITACION\n`;
        dataHist.participantes.forEach(element => {
          resultCompleteHist += `\nINICIO:${element.inicial}\nTERMINO:${element.final}\nCURSO:${element.curso}\nESTADO CURSO:${element.aprobado}\nINSTRUCTOR:${element.instructor}\n`;
        });

      } else {
        resultCompleteHist = 'NO EXISTE DATOS DE SU HISTORICO';
      }
      console.log(resultCompleteHist);
      await sendTextMessage(sender, resultCompleteHist);
      break;
    //Muestra informe del evento consultado
    case "informacionEvento":
      await sendTextMessage(sender, 'Escribe el numero de evento (1,2,3,etc.): ');
      break;
    case "parametroEvento":
      console.log(parameters, ' PARAMETROS');
      //solicitar el parametro gestion
      let parEve = parameters.fields.evento.numberValue;
      console.log('EVENTO!!!:', parEve);
      console.log(sender);
      //obtener los registros
      let rutaParEve = queryAPI('get-evento', [parEve.toString()]);
      console.log(rutaParEve);
      let dataParEve = await requestURL(rutaParEve);
      let resultCompleteParEve = '';
      console.log(dataParEve);
      if (dataParEve.success && dataParEve.evento.participantes.length !== 0) {
        resultCompleteParEve += `INFORMACION DEL EVENTO - Nro. ${parEve}\n`;
        resultCompleteParEve += `FECHA INI: ${dataParEve.evento.fecha_inicial} FECHA FIN: ${dataParEve.evento.fecha_final}\n`;
        resultCompleteParEve += `HORA INI: ${dataParEve.evento.hora_inicial} HORA FIN: ${dataParEve.evento.hora_final}\n`;
        resultCompleteParEve += `DIRECCION: ${dataParEve.evento.direccion}\n`;
        resultCompleteParEve += `CURSO: ${dataParEve.evento.curso.nombre}\n`;
        resultCompleteParEve += `COD. CURSO: ${dataParEve.evento.curso.codigo}\n`;
        resultCompleteParEve += `CANTIDAD PARTICIPANTES: ${dataParEve.evento.participantes.length}\n`;
        /* dataParEve.evento.participantes.forEach(element => {
          resultCompleteParEve += `PARTICIPANTE:${element.empleado.nombre} ${element.empleado.apellido_paterno} ${element.empleado.apellido_materno}\n`;
        }); */

      } else {
        resultCompleteParEve = 'NO EXISTE INFORMACION - CRONOGRAMA';
      }
      console.log(resultCompleteParEve);
      await sendTextMessage(sender, resultCompleteParEve);
      break;
    default:
      //unhandled action, just send back the text
      await handleMessages(messages, sender);
  }
}

async function handleMessage(message, sender) {
  switch (message.message) {
    case "text": // text
      for (const text of message.text.text) {
        if (text !== "") {
          await sendTextMessage(sender, text);
        }
      }
      break;
    case "quickReplies": // quick replies
      let replies = [];
      message.quickReplies.quickReplies.forEach((text) => {
        let reply = {
          content_type: "text",
          title: text,
          payload: text,
        };
        replies.push(reply);
      });
      await sendQuickReply(sender, message.quickReplies.title, replies);
      break;
    case "image": // image
      await sendImageMessage(sender, message.image.imageUri);
      break;
    case "payload":
      let desestructPayload = structProtoToJson(message.payload);
      var messageData = {
        recipient: {
          id: sender,
        },
        message: desestructPayload.facebook,
      };
      await callSendAPI(messageData);
      break;
    default:
      break;
  }
}

async function handleCardMessages(messages, sender) {
  let elements = [];
  for (let m = 0; m < messages.length; m++) {
    let message = messages[m];
    let buttons = [];
    for (let b = 0; b < message.card.buttons.length; b++) {
      let isLink = message.card.buttons[b].postback.substring(0, 4) === "http";
      let button;
      if (isLink) {
        button = {
          type: "web_url",
          title: message.card.buttons[b].text,
          url: message.card.buttons[b].postback,
        };
      } else {
        button = {
          type: "postback",
          title: message.card.buttons[b].text,
          payload:
            message.card.buttons[b].postback === ""
              ? message.card.buttons[b].text
              : message.card.buttons[b].postback,
        };
      }
      buttons.push(button);
    }

    let element = {
      title: message.card.title,
      image_url: message.card.imageUri,
      subtitle: message.card.subtitle,
      buttons,
    };
    elements.push(element);
  }
  await sendGenericMessage(sender, elements);
}

async function handleMessages(messages, sender) {
  try {
    let i = 0;
    let cards = [];
    while (i < messages.length) {
      switch (messages[i].message) {
        case "card":
          for (let j = i; j < messages.length; j++) {
            if (messages[j].message === "card") {
              cards.push(messages[j]);
              i += 1;
            } else j = 9999;
          }
          await handleCardMessages(cards, sender);
          cards = [];
          break;
        case "text":
          await handleMessage(messages[i], sender);
          break;
        case "image":
          await handleMessage(messages[i], sender);
          break;
        case "quickReplies":
          await handleMessage(messages[i], sender);
          break;
        case "payload":
          await handleMessage(messages[i], sender);
          break;
        default:
          break;
      }
      i += 1;
    }
  } catch (error) {
    console.log(error);
  }
}

async function sendToDialogFlow(senderId, messageText) {
  sendTypingOn(senderId);
  try {
    let result;
    setSessionAndUser(senderId);
    let session = sessionIds.get(senderId);
    result = await dialogflow.sendToDialogFlow(
      messageText,
      session,
      "FACEBOOK"
    );
    handleDialogFlowResponse(senderId, result);
  } catch (error) {
    console.log("salio mal en sendToDialogflow...", error);
  }
}

function handleDialogFlowResponse(sender, response) {
  let responseText = response.fulfillmentMessages.fulfillmentText;
  let messages = response.fulfillmentMessages;
  let action = response.action;
  let contexts = response.outputContexts;
  let parameters = response.parameters;

  console.log('CONTEXTO:', JSON.stringify(contexts));

  sendTypingOff(sender);

  if (isDefined(action)) {
    handleDialogFlowAction(sender, action, messages, contexts, parameters);
  } else if (isDefined(messages)) {
    handleMessages(messages, sender);
  } else if (responseText == "" && !isDefined(action)) {
    //dialogflow could not evaluate input.
    sendTextMessage(sender, "No entiendo lo que trataste de decir ...");
  } else if (isDefined(responseText)) {
    sendTextMessage(sender, responseText);
  }
}
async function getUserData(senderId) {
  console.log("consiguiendo datos del usuario...");
  let access_token = config.FB_PAGE_TOKEN;
  try {
    let userData = await axios.get(
      "https://graph.facebook.com/v6.0/" + senderId,
      {
        params: {
          access_token,
        },
      }
    );
    return userData.data;
  } catch (err) {
    console.log("algo salio mal en axios getUserData: ", err);
    return {
      first_name: "",
      last_name: "",
      profile_pic: "",
    };
  }
}

async function sendTextMessage(recipientId, text) {
  if (text.includes("{first_name}") || text.includes("{last_name}")) {
    let userData = await getUserData(recipientId);
    text = text
      .replace("{first_name}", userData.first_name)
      .replace("{last_name}", userData.last_name);
  }
  var messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      text: text,
    },
  };
  await callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
async function sendImageMessage(recipientId, imageUrl) {
  var messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: imageUrl,
        },
      },
    },
  };
  await callSendAPI(messageData);
}

/*
 * Send a button message using the Send API.
 *
 */
async function sendButtonMessage(recipientId, text, buttons) {
  var messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: text,
          buttons: buttons,
        },
      },
    },
  };
  await callSendAPI(messageData);
}

async function sendGenericMessage(recipientId, elements) {
  var messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: elements,
        },
      },
    },
  };

  await callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
async function sendQuickReply(recipientId, text, replies, metadata) {
  var messageData = {
    recipient: {
      id: recipientId,
    },
    message: {
      text: text,
      metadata: isDefined(metadata) ? metadata : "",
      quick_replies: replies,
    },
  };

  await callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId,
    },
    sender_action: "typing_on",
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId,
    },
    sender_action: "typing_off",
  };

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
  return new Promise((resolve, reject) => {
    request(
      {
        uri: "https://graph.facebook.com/v6.0/me/messages",
        qs: {
          access_token: config.FB_PAGE_TOKEN,
        },
        method: "POST",
        json: messageData,
      },
      function (error, response, body) {
        if (!error && response.statusCode == 200) {
          var recipientId = body.recipient_id;
          var messageId = body.message_id;

          if (messageId) {
            console.log(
              "Successfully sent message with id %s to recipient %s",
              messageId,
              recipientId
            );
          } else {
            console.log(
              "Successfully called Send API for recipient %s",
              recipientId
            );
          }
          resolve();
        } else {
          reject();
          console.error(
            "Failed calling Send API",
            response.statusCode,
            response.statusMessage,
            body.error
          );
        }
      }
    );
  });
}

async function receivedPostback(event) {
  var senderId = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  var payload = event.postback.payload;
  switch (payload) {
    default:
      //unindentified payload
      sendToDialogFlow(senderId, payload);
      break;
  }

  console.log(
    "Received postback for user %d and page %d with payload '%s' " + "at %d",
    senderId,
    recipientID,
    payload,
    timeOfPostback
  );
}

function isDefined(obj) {
  if (typeof obj == "undefined") {
    return false;
  }

  if (!obj) {
    return false;
  }

  return obj != null;
}

module.exports = router;
