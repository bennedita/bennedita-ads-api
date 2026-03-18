export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ message: "Listar clientes" });
  }

  if (req.method === "POST") {
    return res.status(200).json({ message: "Criar cliente" });
  }

  return res.status(405).json({ error: "Método não permitido" });
}
