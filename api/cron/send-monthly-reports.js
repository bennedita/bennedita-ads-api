import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  console.log("Running monthly report job");

  try {
    const clients = [
      { name: "BrBrita", slug: "brbrita", email: "viniciusfariabsb@gmail.com" },
      { name: "MF Certificados", slug: "mf-certificados", email: "viniciusfariabsb@gmail.com" },
      { name: "Vinicius Cantor", slug: "vinicius-cantor", email: "viniciusfariabsb@gmail.com" },
      { name: "BSB Limpeza", slug: "bsblimpeza", email: "viniciusfariabsb@gmail.com" },
      { name: "Gráfica Mariano", slug: "grafica-mariano", email: "viniciusfariabsb@gmail.com" },
      { name: "Habka Fisioterapia", slug: "habka-fisioterapia", email: "viniciusfariabsb@gmail.com" },
    ];

    const sent = [];
    const failed = [];

    for (const client of clients) {
      const reportUrl = `https://lead-report-peek.lovable.app/r/${client.slug}`;

      console.log(`Sending report to: ${client.name} <${client.email}>`);

      try {
        const response = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: client.email,
          subject: `Relatório Google Ads - ${client.name}`,
          html: `
            <h2>Relatório de Performance Google Ads</h2>
            <p>Olá!</p>
            <p>Seu relatório de performance já está disponível:</p>
            <p>
              <a href="${reportUrl}" target="_blank" rel="noopener noreferrer">
                Acessar relatório
              </a>
            </p>
            <p>Este relatório foi gerado automaticamente pela plataforma Bennedita.</p>
          `,
        });

        console.log("Resend response:", response);

        sent.push({
          client: client.name,
          email: client.email,
          report: reportUrl,
          response,
        });
      } catch (error) {
        console.error(`Failed to send email for ${client.name}:`, error);

        failed.push({
          client: client.name,
          email: client.email,
          report: reportUrl,
          error: error?.message || "Unknown error",
        });
      }

      await sleep(1500);
    }

    return res.status(200).json({
      success: failed.length === 0,
      message:
        failed.length === 0
          ? "All monthly reports sent successfully"
          : "Monthly reports processed with some failures",
      totalClients: clients.length,
      sentCount: sent.length,
      failedCount: failed.length,
      sent,
      failed,
    });
  } catch (error) {
    console.error("Monthly report job failed:", error);

    return res.status(500).json({
      success: false,
      error: "Monthly report job failed",
      details: error?.message || "Unknown error",
    });
  }
}
