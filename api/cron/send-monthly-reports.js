import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {

  console.log("Running monthly report job");

  try {

    const clients = [

      { name: "BrBrita", slug: "brbrita", email: "viniciusfariabsb@gmail.com" },
      { name: "MF Certificados", slug: "mf-certificados", email: "viniciusfariabsb@gmail.com" },
      { name: "Vinicius Cantor", slug: "vinicius-cantor", email: "viniciusfariabsb@gmail.com" },
      { name: "BSB Limpeza", slug: "bsblimpeza", email: "viniciusfariabsb@gmail.com" },
      { name: "Gráfica Mariano", slug: "grafica-mariano", email: "viniciusfariabsb@gmail.com" },
      { name: "Habka Fisioterapia", slug: "habka-fisioterapia", email: "viniciusfariabsb@gmail.com" }

    ];

    const results = [];

    for (const client of clients) {

      const reportUrl = `https://lead-report-peek.lovable.app/r/${client.slug}`;

      console.log("Sending report to:", client.name);

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: client.email,
        subject: `Relatório Google Ads - ${client.name}`,
        html: `
          <h2>Relatório de Performance Google Ads</h2>
          <p>Olá!</p>
          <p>Seu relatório de performance já está disponível:</p>
          <p>
            <a href="${reportUrl}" target="_blank">
              Acessar relatório
            </a>
          </p>
          <p>Este relatório foi gerado automaticamente pela plataforma Bennedita.</p>
        `
      });

      results.push({
        client: client.name,
        report: reportUrl
      });

    }

    return res.status(200).json({
      success: true,
      message: "Emails sent successfully",
      results
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Monthly report job failed"
    });

  }

}
