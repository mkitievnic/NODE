const express = require("express");
//files
const { PASWORD, NAMEMONGODB } = require("./config");
//const bodyParser = require("body-parser");
const app = express();
var exphbs = require("express-handlebars");
const mongoose = require("mongoose");


app.engine(
  ".hbs",
  exphbs({
    extname: ".hbs",
  })
);
app.set("view engine", ".hbs");

const port = process.env.PORT || 3000;

// for parsing json
app.use(
  express.json({
    limit: "20mb",
  })
);
// parse application/x-www-form-urlencoded
app.use(
  express.urlencoded({
    extended: false,
    limit: "20mb",
  })
);

mongoose.connect(
  `mongodb+srv://mkitievnic:${PASWORD}@dialogflowcluster.crwqv.mongodb.net/${NAMEMONGODB}?retryWrites=true&w=majority`,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    useCreateIndex: true,
  },
  (err, res) => {
    if (err) return console.log("Hubo un error en la base de datos ", err);
    console.log("BASE DE DATOS ONLINE");
  }
);

app.use("/messenger", require("./Facebook/facebookBot"));
app.use("/api", require("./routes/api"));
app.use("/", require("./routes/routes"));

app.get("/", (req, res) => {
  return res.send("Chatbot Funcionando 🤖🤖🤖");
});

app.listen(port, () => {
  console.log(`Escuchando peticiones en el puerto ${port}`);
});
