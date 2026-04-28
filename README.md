# FairFlow AI (Project Oculus)

**FairFlow AI** is an advanced, AI-powered platform designed to perform comprehensive bias auditing and fairness evaluations on machine learning datasets and models. Built to empower non-technical stakeholders, it translates complex statistical fairness metrics into plain-English explanations using Google's Gemini LLM.

## 🚀 Key Features

*   **Automated Fairness Auditing:** Instantly evaluate datasets for bias using industry-standard metrics, including Demographic Parity, Equalized Odds, and Disparate Impact.
*   **Intelligent Bias Detection:** Utilizes Gemini API to identify sensitive attributes and potential proxy variables within datasets automatically.
*   **What-If Counterfactual Analysis:** Interactively test how changing a single sensitive attribute (e.g., gender, ethnicity) affects the model's decision boundaries in real-time.
*   **Bias Mitigation Strategies:** Apply and compare algorithmic mitigation strategies (like reweighting) to see the trade-offs between model accuracy and fairness.
*   **Supply Chain Risk Management:** Integrated supply chain mapping to visualize global logistics, tracking shipments and flagging potential disruption risks.
*   **Plain-English Explanations:** Leverages Generative AI to explain complex mathematical fairness concepts and trade-offs to business leaders and compliance officers seamlessly.

## 🛠️ Technology Stack

*   **Frontend:** Vanilla JavaScript, HTML5, CSS3 (Glassmorphism UI, Responsive Design)
*   **Backend:** Python, FastAPI, Uvicorn
*   **Data Processing:** Pandas, NumPy, Scikit-learn
*   **AI / LLM Integration:** Google GenAI SDK (Gemini API)
*   **Deployment:** Docker, Google Cloud Run

## 📁 Project Structure

```text
.
├── backend/
│   ├── main.py              # FastAPI server, fairness metrics, and routing
│   └── requirements.txt     # Python dependencies
├── assets/                  # Images, branding, and icons
├── index.html               # Main frontend interface
├── app.js                   # Client-side logic and API integration
├── styles.css               # UI styling and animations
├── Dockerfile               # Containerization configuration
└── .env                     # Environment variables (e.g., GEMINI_API_KEY)
```

## ⚙️ Local Development

### Prerequisites
*   Python 3.10+
*   Google Gemini API Key

### Setup
1.  **Clone the repository.**
2.  **Set up the environment:** Create a `.env` file in the root directory and add your Gemini API key:
    ```env
    GEMINI_API_KEY=your_google_gemini_api_key_here
    ```
3.  **Install dependencies:**
    ```bash
    pip install -r backend/requirements.txt
    ```
4.  **Run the backend server:**
    ```bash
    cd backend
    python main.py
    ```
    *The API will be available at `http://localhost:8000`.*
5.  **Access the application:** Open `index.html` in your web browser, or navigate to `http://localhost:8000` if the static files are mounted via FastAPI.

## ☁️ Deployment (Google Cloud Run)

This application is fully containerized and ready for scalable deployment on Google Cloud Run as a single, unified container.

1.  Build and deploy using the Google Cloud CLI from the project root:
    ```bash
    gcloud run deploy fairflow-ai --source . --region us-central1 --allow-unauthenticated
    ```
2.  Securely inject your API key into the deployed service:
    ```bash
    gcloud run services update fairflow-ai --region us-central1 --set-env-vars="GEMINI_API_KEY=your_api_key_here"
    ```

## 🛡️ Compliance & Ethics

FairFlow AI is designed to help organizations adhere to emerging AI regulations, such as the EU AI Act, by providing transparent, reproducible, and explainable fairness metrics for automated decision-making systems.
