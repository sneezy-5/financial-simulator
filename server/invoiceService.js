const fs = require('fs');
const path = require('path');
const { Invoice } = require('./database');
const PdfPrinter = require('pdfmake');

const INVOICES_DIR = path.join(__dirname, 'uploads', 'invoices');
if (!fs.existsSync(INVOICES_DIR)) {
    fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

const formatFCFA = (val) => Math.round(val || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

async function generateInvoicePdfMake({ invoiceNumber, date, user, plan, amount, reference }) {
    // Utiliser les polices standards intégrées à PDFKit
    const fonts = {
        Helvetica: {
            normal: 'Helvetica',
            bold: 'Helvetica-Bold',
            italics: 'Helvetica-Oblique',
            bolditalics: 'Helvetica-BoldOblique'
        }
    };
    const printer = new PdfPrinter(fonts);

    const billedTo = user.companyName || user.name || user.email;
    const dateStr = new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    const docDefinition = {
        defaultStyle: { font: 'Helvetica' },
        content: [
            {
                columns: [
                    {
                        text: [
                            { text: 'ONDA\n', bold: true, fontSize: 20, color: '#4f46e5' },
                            { text: 'Plateforme Financière & Paie\n', fontSize: 10, color: 'gray' },
                            { text: 'info@eonda.online', fontSize: 10, color: 'gray' }
                        ]
                    },
                    {
                        text: [
                            { text: 'FACTURE\n', bold: true, fontSize: 16 },
                            { text: `N° ${invoiceNumber}\n`, fontSize: 10, color: 'gray' },
                            { text: dateStr, fontSize: 10, color: 'gray' }
                        ],
                        alignment: 'right'
                    }
                ],
                margin: [0, 0, 0, 20]
            },
            {
                text: 'FACTURE À',
                fontSize: 10,
                bold: true,
                color: 'gray',
                margin: [0, 20, 0, 5]
            },
            {
                text: billedTo,
                bold: true,
                fontSize: 12
            },
            {
                text: user.email,
                color: 'gray',
                margin: [0, 0, 0, 20]
            },
            {
                table: {
                    headerRows: 1,
                    widths: ['*', 'auto'],
                    body: [
                        [ 
                            { text: 'Description', bold: true, fillColor: '#f1f5f9', margin: [5, 5, 5, 5] }, 
                            { text: 'Montant', bold: true, alignment: 'right', fillColor: '#f1f5f9', margin: [5, 5, 5, 5] } 
                        ],
                        [ 
                            { text: `Abonnement ${plan.name} — 1 mois (jusqu'à ${plan.bulletinLimit} bulletins)`, margin: [5, 10, 5, 10] }, 
                            { text: `${formatFCFA(amount)} FCFA`, alignment: 'right', margin: [5, 10, 5, 10] } 
                        ],
                        [ 
                            { text: 'Total', bold: true, alignment: 'right', margin: [5, 10, 5, 10] }, 
                            { text: `${formatFCFA(amount)} FCFA`, bold: true, color: '#4f46e5', alignment: 'right', margin: [5, 10, 5, 10] } 
                        ]
                    ]
                },
                layout: 'lightHorizontalLines'
            },
            reference ? { text: `Référence de paiement : ${reference}`, fontSize: 10, color: 'gray', margin: [0, 20, 0, 0] } : {},
            {
                text: 'Facture générée automatiquement par ONDA. Pour toute question, contactez info@eonda.online.',
                fontSize: 10,
                color: 'gray',
                margin: [0, 40, 0, 0]
            }
        ]
    };

    return new Promise((resolve, reject) => {
        try {
            const pdfDoc = printer.createPdfKitDocument(docDefinition);
            const chunks = [];
            pdfDoc.on('data', (chunk) => chunks.push(chunk));
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
            pdfDoc.on('error', reject);
            pdfDoc.end();
        } catch(e) {
            reject(e);
        }
    });
}

async function createInvoiceForPayment({ userId, user, plan, amount, reference }) {
    const now = new Date();

    const invoice = await Invoice.create({
        userId,
        subscriptionTier: plan.code,
        amount,
        reference,
        status: 'paid'
    });

    const invoiceNumber = `ONDA-${now.getFullYear()}-${String(invoice.id).padStart(6, '0')}`;
    const pdfBuffer = await generateInvoicePdfMake({ invoiceNumber, date: now, user, plan, amount, reference });

    const pdfPath = path.join(INVOICES_DIR, `${invoiceNumber}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    invoice.invoiceNumber = invoiceNumber;
    invoice.pdfPath = pdfPath;
    await invoice.save();

    return invoice;
}

async function regenerateInvoicePdf(invoice, user, plan) {
    if (!invoice.invoiceNumber) {
        invoice.invoiceNumber = `ONDA-${new Date(invoice.createdAt).getFullYear()}-${String(invoice.id).padStart(6, '0')}`;
    }
    
    const pdfBuffer = await generateInvoicePdfMake({ 
        invoiceNumber: invoice.invoiceNumber, 
        date: invoice.createdAt, 
        user, 
        plan, 
        amount: invoice.amount, 
        reference: invoice.reference 
    });
    
    const pdfPath = path.join(INVOICES_DIR, `${invoice.invoiceNumber}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    
    invoice.pdfPath = pdfPath;
    await invoice.save();
    return pdfPath;
}

module.exports = { createInvoiceForPayment, regenerateInvoicePdf };
