# 🚀 DataVault Assistant

AI-Powered Data Vault 2.1 Model Generator

Transform source data models (ERDs, PDFs, schema docs) into Data Vault 2.1–compliant models with AI-driven intelligence, visualization, and export features.

## 🎯 Features

- **🖼️ OCR Upload & Extraction**: Upload images or PDFs of source models; extract text via OCR.space
- **🧩 AI Model Conversion**: Use GROQ API to convert source model text → Data Vault 2.1 structure
- **📚 Knowledge-Aware Mode**: Ground model generation in uploaded DV2.1 methodology docs
- **🧠 Storage Layer**: DuckDB for persisting OCR results, models, and reference knowledge
- **🎨 Visualization**: Interactive Cytoscape.js visualization (drag, zoom, color-coded)
- **💾 Export**: Export to Draw.io XML, CSV, JSON

## 🏗️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | HTML + JS + Cytoscape.js | Visualization UI |
| Backend | Flask | API server |
| OCR Engine | OCR.space API | Image → text |
| LLM Engine | GROQ API | Text → DV2.1 model |
| Database | DuckDB | Local structured storage |
| Deployment | Render / Railway | Full-stack hosting |

## 📋 Prerequisites

- Python 3.9+
- OCR.space API Key (free at [ocr.space/ocrapi](https://ocr.space/ocrapi))
- GROQ API Key (free at [console.groq.com](https://console.groq.com))

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/datavault-assistant.git
cd datavault-assistant
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```
OCR_SPACE_KEY=your_ocr_space_api_key
GROQ_API_KEY=your_groq_api_key
```

### 4. Run the Application

```bash
python app.py
```

Visit: http://localhost:5000

## 📁 Project Structure

```
DataVaultAssistant/
│
├── app.py                       # Flask backend
├── requirements.txt             # Python dependencies
├── .env.example                 # Environment variables template
├── README.md                    # This file
│
├── db/
│   └── datavault.duckdb        # DuckDB database (auto-created)
│
├── knowledge/
│   └── dv2.1_methodology.pdf   # Optional methodology docs
│
├── templates/
│   └── index.html              # Main UI template
│
├── static/
│   ├── css/
│   │   └── style.css           # Styles
│   └── js/
│       └── main.js             # Frontend logic
│
└── uploads/                     # Temporary upload folder
```

## 🔄 Workflow

1. **Upload Source** → User uploads ERD (image/PDF) or schema file
2. **OCR Extraction** → Flask calls OCR.space API, stores in DuckDB
3. **Data Vault Generation** → GROQ API transforms text into DV2.1 model
4. **Visualization** → Cytoscape.js renders hubs, links, satellites
5. **Export** → Download as Draw.io XML / CSV / JSON

## 🗂️ Database Schema

### ocr_results
```sql
CREATE TABLE ocr_results (
  id INTEGER PRIMARY KEY,
  filename TEXT,
  extracted_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### dv_models
```sql
CREATE TABLE dv_models (
  id INTEGER PRIMARY KEY,
  ocr_id INTEGER,
  model_json TEXT,
  grounded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ocr_id) REFERENCES ocr_results(id)
);
```

### knowledge_docs
```sql
CREATE TABLE knowledge_docs (
  id INTEGER PRIMARY KEY,
  name TEXT,
  content TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🎨 Data Vault Entity Colors

- **Blue** 🔵: Hubs (Business Keys)
- **Green** 🟢: Links (Relationships)
- **Orange** 🟠: Satellites (Attributes)

## 📤 Export Formats

1. **JSON**: Complete model structure
2. **CSV**: Tabular representation
3. **Draw.io XML**: Editable diagram

## 🚀 Deployment to Render

### 1. Create `render.yaml`

```yaml
services:
  - type: web
    name: datavault-assistant
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app
    envVars:
      - key: OCR_SPACE_KEY
        sync: false
      - key: GROQ_API_KEY
        sync: false
```

### 2. Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 3. Connect to Render

- Go to [render.com](https://render.com)
- Create new Web Service
- Connect your GitHub repo
- Add environment variables
- Deploy!

## 🧪 Testing Locally

1. **Upload a sample ERD image**
2. **Click "Extract Schema (OCR)"**
3. **Enable "Knowledge-Grounded Mode"** (optional)
4. **Click "Generate Data Vault 2.1"**
5. **View the interactive visualization**
6. **Export as Draw.io XML**

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License

## 🔗 Links

- [Data Vault 2.0 Specification](https://danlinstedt.com/)
- [OCR.space API](https://ocr.space/ocrapi)
- [GROQ API](https://console.groq.com)
- [Cytoscape.js](https://js.cytoscape.org/)

## 📋 Next Development Phases:
Phase 2: Enhancements (After testing Phase 1)

 Improve AI prompt for better DV 2.1 compliance
 Add manual editing capability (override AI decisions)
 Enhanced Draw.io export with better layouts
 PNG/SVG static image export
 Model versioning and history

Phase 3: Advanced Features

 Multi-source model merging
 Data lineage tracking
 DDL script generation (CREATE TABLE statements)
 Validation against DV 2.1 best practices
 Collaborative features (share models)

## 📧 Support

For issues or questions, please open an issue on GitHub.

---

Made with ❤️ for Data Engineers