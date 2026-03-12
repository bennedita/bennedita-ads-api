export default async function handler(req, res) {

  console.log("Running monthly report job")

  try {

    const clients = [
      {
        name: "BrBrita",
        slug: "brbrita",
        email: "seu-email@exemplo.com"
      },
      {
        name: "MF Certificados",
        slug: "mf-certificados",
        email: "seu-email@exemplo.com"
      }
    ]

    const results = []

    for (const client of clients) {

      const reportUrl = `https://lead-report-peek.lovable.app/r/${client.slug}`

      console.log("Generating report for:", client.name)

      results.push({
        client: client.name,
        report: reportUrl
      })

    }

    return res.status(200).json({
      success: true,
      message: "Monthly reports processed",
      results
    })

  } catch (error) {

    console.error(error)

    return res.status(500).json({
      error: "Monthly report job failed"
    })

  }
}
