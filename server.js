const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({ storage });

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function normalizeImage(img) {
  if (!img) return { url: "", label: "" };
  if (typeof img === "string") return { url: img, label: "" };
  return { url: img.url || "", label: img.label || "" };
}

// GET Products
app.get("/api/products", (req, res) => {
  let products = readJSON(PRODUCTS_FILE, []);
  products = products.map(p => ({
    ...p,
    images: (p.images || []).map(normalizeImage)
  }));
  res.json(products);
});

// POST New Product
app.post("/api/products", upload.array("images"), (req, res) => {
  try {
    const products = readJSON(PRODUCTS_FILE, []);
    let labels = req.body.labels || [];
    if (!Array.isArray(labels)) labels = [labels];

    const newImages = (req.files || []).map((file, idx) => ({
      url: `/uploads/${file.filename}`,
      label: labels[idx] ? String(labels[idx]).trim() : ""
    }));

    let sizes = [];
    if (req.body.sizes) {
      sizes = String(req.body.sizes).split(",").map(s => s.trim()).filter(Boolean);
    }

    const newProduct = {
      id: Date.now().toString(),
      name: req.body.name || "",
      price: Number(req.body.price) || 0,
      category: req.body.category || "",
      sizes: sizes,
      description: req.body.description || "",
      images: newImages
    };

    products.push(newProduct);
    writeJSON(PRODUCTS_FILE, products);
    res.status(201).json(newProduct);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT Update Product
app.put("/api/products/:id", (req, res) => {
  try {
    const products = readJSON(PRODUCTS_FILE, []);
    const idx = products.findIndex(p => String(p.id) === String(req.params.id));
    if (idx === -1) return res.status(404).json({ error: "المنتج غير موجود" });

    let sizes = [];
    if (req.body.sizes) {
      if (Array.isArray(req.body.sizes)) sizes = req.body.sizes;
      else sizes = String(req.body.sizes).split(",").map(s => s.trim()).filter(Boolean);
    }

    let existingImages = (products[idx].images || []).map(normalizeImage);
    
    if (req.body.imageLabels && Array.isArray(req.body.imageLabels)) {
      existingImages = existingImages.map((img, i) => ({
        url: img.url,
        label: req.body.imageLabels[i] !== undefined ? String(req.body.imageLabels[i]).trim() : img.label
      }));
    }

    products[idx] = {
      ...products[idx],
      name: req.body.name !== undefined ? req.body.name : products[idx].name,
      price: req.body.price !== undefined ? Number(req.body.price) : products[idx].price,
      category: req.body.category !== undefined ? req.body.category : products[idx].category,
      sizes: sizes,
      description: req.body.description !== undefined ? req.body.description : products[idx].description,
      images: existingImages
    };

    writeJSON(PRODUCTS_FILE, products);
    res.json(products[idx]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST Add New Images
app.post("/api/products/:id/images", upload.array("images"), (req, res) => {
  try {
    const products = readJSON(PRODUCTS_FILE, []);
    const idx = products.findIndex(p => String(p.id) === String(req.params.id));
    if (idx === -1) return res.status(404).json({ error: "المنتج غير موجود" });

    let labels = req.body.labels || [];
    if (!Array.isArray(labels)) labels = [labels];

    const newImages = (req.files || []).map((file, i) => ({
      url: `/uploads/${file.filename}`,
      label: labels[i] ? String(labels[i]).trim() : ""
    }));

    const currentImages = (products[idx].images || []).map(normalizeImage);
    products[idx].images = [...currentImages, ...newImages];

    writeJSON(PRODUCTS_FILE, products);
    res.json(products[idx]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE Image
app.delete("/api/products/:id/images/:imgIndex", (req, res) => {
  try {
    const products = readJSON(PRODUCTS_FILE, []);
    const idx = products.findIndex(p => String(p.id) === String(req.params.id));
    if (idx === -1) return res.status(404).json({ error: "المنتج غير موجود" });

    const imgIdx = Number(req.params.imgIndex);
    if (products[idx].images && products[idx].images[imgIdx]) {
      const imgObj = normalizeImage(products[idx].images[imgIdx]);
      if (imgObj.url.startsWith("/uploads/")) {
        const filePath = path.join(__dirname, imgObj.url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      products[idx].images.splice(imgIdx, 1);
      writeJSON(PRODUCTS_FILE, products);
    }
    res.json(products[idx]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE Product
app.delete("/api/products/:id", (req, res) => {
  try {
    let products = readJSON(PRODUCTS_FILE, []);
    const target = products.find(p => String(p.id) === String(req.params.id));
    if (target && target.images) {
      target.images.forEach(img => {
        const imgObj = normalizeImage(img);
        if (imgObj.url.startsWith("/uploads/")) {
          const filePath = path.join(__dirname, imgObj.url);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      });
    }
    products = products.filter(p => String(p.id) !== String(req.params.id));
    writeJSON(PRODUCTS_FILE, products);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Settings API
app.get("/api/settings", (req, res) => {
  res.json(readJSON(SETTINGS_FILE, { whatsapp: "" }));
});

app.put("/api/settings", (req, res) => {
  const settings = { whatsapp: req.body.whatsapp || "" };
  writeJSON(SETTINGS_FILE, settings);
  res.json(settings);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});