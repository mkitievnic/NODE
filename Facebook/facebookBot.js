//libraries
const express = require("express");
const router = express.Router();
const request = require("request");
const uuid = require("uuid");
const axios = require("axios");
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
    /*     case "Helados.info.action":
          let icecreamName = parameters.fields.icecreamName.stringValue;
          let icecreamInfo = await Product.findOne({ name: icecreamName });
          sendGenericMessage(sender, [
            {
              title: icecreamInfo.name + " $" + icecreamInfo.price,
              image_url: icecreamInfo.img,
              subtitle: icecreamInfo.description,
              buttons: [
                {
                  type: "postback",
                  title: "Hacer compra",
                  payload: "hacer_compra",
                },
                {
                  type: "postback",
                  title: "Ver más helados",
                  payload: "ver_mas_helados",
                },
              ],
            },
          ]);
          break;
        case "Code.DemasElementos.action":
          await sendTextMessage(sender, "Estoy mandando una imagen y un boton");
          await sendImageMessage(
            sender,
            "https://encrypted-tbn0.gstatic.com/images?q=tbn%3AANd9GcQeOnyjNIucV-XNe6DcdOuhKahh9jdNY4RkuQ&usqp=CAU"
          );
          await sendButtonMessage(sender, "Ejemplo de boton", [
            {
              type: "web_url",
              url: "https://www.messenger.com",
              title: "Visit Messenger",
            },
          ]);
          break;
        case "Code.menuCarrusel.action":
          let helados = [
            {
              id: 1,
              nombre: "Helado de fresa",
              img:
                "https://cocina-casera.com/wp-content/uploads/2018/05/helado-de-fresa-casero.jpg",
              descripcion: "Los helados de fresa son muy ricos",
              precio: 7,
            },
            {
              id: 2,
              nombre: "Helado de piña",
              img:
                "https://okdiario.com/img/2019/07/07/receta-de-helado-casero-de-pina-1-655x368.jpg",
              descripcion: "Los helados de piña son muy ricos",
              precio: 5,
            },
            {
              id: 3,
              nombre: "Helado de chocolate",
              img:
                "https://placeralplato.com/files/2015/08/helado-de-chocolate.jpg",
              descripcion: "Los helados de chocolate son muy ricos",
              precio: 10,
            },
          ];
          let tarjetas = [];
          helados.forEach((helado) => {
            tarjetas.push({
              title: helado.nombre + " $" + helado.precio,
              image_url: helado.img,
              subtitle: helado.descripcion,
              buttons: [
                {
                  type: "postback",
                  title: "Hacer compra",
                  payload: "hacer_compra",
                },
                {
                  type: "postback",
                  title: "Ver más helados",
                  payload: "ver_mas_helados",
                },
              ],
            });
          });
          sendGenericMessage(sender, tarjetas);
    
          break;
        case "Codigo.quickReply.action":
          let replies = [];
          for (let i = 1; i <= 5; i++) {
            replies.push({
              image_url:
                "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Check_green_icon.svg/1200px-Check_green_icon.svg.png",
              title: i,
              payload: "si_acepto",
              content_type: "text",
            });
          }
          sendQuickReply(sender, "Ejemplo de quick reply", replies);
          break; */
    case "prueba":
      sendTextMessage(sender, "este es un mensaje enviado desde el código");
      handleMessages(messages, sender);
      break;
    case "input.welcome":
      /* sendTextMessage(sender, "este es un mensaje enviado desde el código"); */

      await sendQuickReply(sender, "Que funcionalidad deseas realizar?", [
        {
          "content_type": "text",
          "title": "Informes Capacitación",
          "payload": "INFORMES_PAYLOAD",
          "image_url": "https://img.icons8.com/nolan/72/medical-history.png",
        }, {
          "content_type": "text",
          "title": "Preguntas Frecuentes (F.A.Q.)",
          "payload": "FAQ_PAYLOAD",
          "image_url": "https://img.icons8.com/nolan/2x/questions.png",
        }
      ]);
      /* handleMessages(messages, sender); */
      break;
    case "informes":
      await sendGenericMessage(sender, [
        {
          "buttons": [
            {
              "title": "Mostrar Informacion",
              "payload": "CURSOS PROXIMOS A VENCERSE",
              "type": "postback"
            },
            {
              "title": "Generar Informe...",
              "payload": "CURSO_PROXIMOS_A_VENCERSE_REPORTE",
              "type": "postback"
            }
          ],
          "title": "CURSOS PROXIMOS A VENCERSE",
          "image_url": "https://economipedia.com/wp-content/uploads/Fecha-de-vencimiento-1.png",
          "subtitle": "Cursos proximos a vencerse."
        },
        {
          "subtitle": "Cumplimiento de matriz de capacitación",
          "title": "CUMPLIMIENTO DE MATRIZ",
          "buttons": [
            {
              "payload": "MATRIZ_DE_CAPACITACION",
              "type": "postback",
              "title": "Mostrar Informacion"
            },
            {
              "title": "Generar Informe...",
              "payload": "MATRIZ_DE_CAPACITACION_REPORTE",
              "type": "postback"
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
            },
            {
              "title": "Generar Informe...",
              "payload": "CONDUCTORES_HABILITADOS_REPORTE",
              "type": "postback"
            }
          ]
        },
        {
          "buttons": [
            {
              "payload": "WELL CONTROL SCHOOL",
              "title": "Mostrar Información",
              "type": "postback"
            },
            {
              "title": "Generar Informe...",
              "payload": "WELL_CONTROL_SCHOOL_REPORTE",
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
              "title": "Mostrar Información"
            },
            {
              "title": "Generar Informe...",
              "payload": "INFORMACION_DEL_EVENTO_REPORTE",
              "type": "postback"
            }
          ],
          "title": "INFORMACION DE UN EVENTO",
          "subtitle": "Información del evento a asistir."
        },
        {
          "image_url": "https://image.freepik.com/vector-gratis/concepto-cursos-linea_23-2148533386.jpg",
          "buttons": [
            {
              "type": "postback",
              "title": "Mostrar Información",
              "payload": "HISTORICO DE CAPACITACION"
            },
            {
              "title": "Generar Informe...",
              "payload": "HISTORICO_DE_CAPACITACION_REPORTE",
              "type": "postback"
            }
          ],
          "title": "HISTORICO DE CAPACITACION",
          "subtitle": "Todos los cursos realizados a la fecha."
        },
        {
          "title": "CRONOGRAMA DE CAPACITACIÓN",
          "image_url": "https://luna1.co/9229bd.png",
          "buttons": [
            {
              "payload": "CRONOGRAMA DE CAPACITACION",
              "title": "Mostrar Información",
              "type": "postback"
            },
            {
              "title": "Generar Informe...",
              "payload": "CRONOGRAMA_DE_CAPACITACION_REPORTE",
              "type": "postback"
            }
          ],
          "subtitle": "Eventos(cursos), realizados o programados."
        }
      ]);
      break;
    case "CumplimientoMatrizParametros":
      console.log(parameters, ' PARAMETROS');
      //solicitar el parametro gestion
      let gestion = parameters.fields.gestion.numberValue;
      console.log('GESTION!!!:', gestion);
      //obtener los registros
      let ruta = queryAPI('seguimiento', [gestion.toString(), '8581']);
      console.log(ruta);
      let data = await requestURL(ruta);
      let resultComplete = '';
      console.log(data.cursos);
      if (data.success && data.cursos.length !== 0) {
        resultComplete = `*MATRIZ DE SEGUIMIENTO INDIVIDUAL - GESTION ${data.gestion}*\n
        *Legajo-Nombre Completo*: ${data.empleados} \n
        *SEGUN TU FUNCIÓN,DEBERIAS REALIZAR LOS SIGUIENTES CURSOS:*\n`;
        data.cursos.forEach(element => {
          resultComplete += `
            *${element.curso}:* _${eliminarItalicas(element.value)}_\n
            `
        });

      } else {
        resultComplete = '*NO EXISTE INFORMACION - MATRIZ DE SEGUIMIENTO.*';
      }
      console.log(resultComplete);
      await sendTextMessage(sender, resultComplete);
      break;
    case "CumplimientoMatriz":
      await sendTextMessage(sender, 'Escribe de la gestión por favor (2000,2001,etc.): ');
      break;

    //Mostrar informacion del reporte.
    case "wellControlHabilitados":
      sendTextMessage(sender, `Estas con el intent: ${action}`);
      break;
    //Mostrar informacion del reporte.
    case "cursosProximosAVencerse":
      sendTextMessage(sender, `Estas con el intent: ${action}`);
      break;
    //Mostrar informacion del reporte.
    case "wellControlHabilitados":
      sendTextMessage(sender, `Estas con el intent: ${action}`);
      break;
    //Mostrar informacion del reporte.
    case "conductoresHabilitadosDeshabilitados":
      sendTextMessage(sender, `Estas con el intent: ${action}`);
      break;
    //Mostrar informacion del reporte.
    case "cronogramaCapacitacion":
      sendTextMessage(sender, `Estas con el intent: ${action}`);
      break;
    //Mostrar informacion del reporte.
    case "historicoCapacitacion":
      sendTextMessage(sender, `Estas con el intent: ${action}`);
      break;
    //Mostrar informacion del reporte.
    case "informacionEvento":
      sendTextMessage(sender, `Estas con el intent: ${action}`);
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
