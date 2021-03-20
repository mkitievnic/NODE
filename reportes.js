'use strict'
//Configuracion librerias
const PdfPrinter = require('pdfmake');
const fs = require('fs');

// Define font files
let fonts = {
    Roboto: {
        normal: 'fonts/static/RobotoSlab-Regular.ttf'

    }
};

let printer = new PdfPrinter(fonts);

let docDefinition = {
    content: [
        'First paragraph',
        'Another paragraph, this time a little bit longer to make sure, this line will be divided into at least two lines'
    ]
};

let options = {
    // ...
}

let pdfDoc = printer.createPdfKitDocument(docDefinition, options);
let fileName = Date.now()
console.log(fileName);
pdfDoc.pipe(fs.createWriteStream('reportes/' + fileName + '.pdf'));
pdfDoc.end();


if (fs.existsSync('reportes/' + fileName + '.pdf')) {
    fs.unlink('reportes/' + fileName + '.pdf', (err) => {
        if (err) throw err;
        console.log(`El archivo:${fileName}.pdf fue borrado`);
    });
} else {
    console.log(`El archivo:${fileName}.pdf NO EXISTE`);
}