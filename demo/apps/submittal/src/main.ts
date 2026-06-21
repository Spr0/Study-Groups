import "@sg/core/styles.css";
import "./styles.css";
import { createReviewApp } from "@sg/core";
import { submittalReview } from "@sg/sample-data";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app mount point");

createReviewApp(root, { useCase: submittalReview });
