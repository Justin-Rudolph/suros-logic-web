import LineItemAIHelper from "@/components/LineItemAIHelper";

import React, {
    useState,
    ChangeEvent,
    KeyboardEvent,
    FormEvent,
    FocusEvent,
    DragEvent,
    useEffect
} from "react";

import "./BidForm.css";
import { GripVertical, Trash2 } from "lucide-react";
import surosLogo from "@/assets/suros-logo-new.png";
import { LineItem, BidFormState } from "./types";
import { useAuth } from "@/context/AuthContext";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "@/styles/gradients.css";
import {
    addDoc,
    collection,
    doc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { generateBidWorkspaceOverviewSummary } from "@/lib/bidWorkspaceOverview";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { BidProjectTimelineStage } from "@/models/BidForms";
import { renderBidEditorHtml } from "@/lib/bidFormProposal/template";
import { touchBidFormUpdatedAt } from "@/lib/touchBidForm";

type FormErrors = Record<string, boolean>;

// Extend your existing BidFormState without forcing you to edit ./types yet
type ExtendedBidFormState = BidFormState & {
    tax_percentage: string; // e.g. "7%"
    contingency_percentage: string; // e.g. "10%"
};

type BidRecordStatus = "draft" | "submitted";
type PrefillBidState = {
    id?: string;
    status?: BidRecordStatus;
    projectTimelineStage?: BidProjectTimelineStage;
    formSnapshot: ExtendedBidFormState;
    lineItems: LineItem[];
};

const initialFormState: ExtendedBidFormState = {
    company_name: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    company_slogan: "",
    invoice_date: "",
    invoice_number: "",
    salesperson: "",
    job: "",
    payment_terms: "",
    approx_weeks: "",
    contingency_percentage: "",
    contingency_coverage: "",
    tax_percentage: "7",
    total_costs: "",
    deposit_percentage: "",
    weekly_payments: "",
    customer_name: "",
    customer_address: "",
    customer_phone: "",
    customer_email: "",
};

const placeholderTrades = ["Plumbing", "Drywall", "Electrical", "Flooring"];

const emptyLineItem: LineItem = {
    trade: "",
    scope: "",
    material_labor_included: "Yes",
    line_total: "",
};

const BidForm: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { bidId } = useParams();
    const { profile, loading, user } = useAuth();

    const [form, setForm] = useState<ExtendedBidFormState>(initialFormState);
    const [numLineItems, setNumLineItems] = useState("");
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [draggedLineItemIndex, setDraggedLineItemIndex] = useState<number | null>(null);
    const [lineItemDragOverIndex, setLineItemDragOverIndex] = useState<number | null>(null);
    const [isLineItemReorderMode, setIsLineItemReorderMode] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentBidId, setCurrentBidId] = useState<string | null>(null);
    const [currentProjectTimelineStage, setCurrentProjectTimelineStage] = useState<BidProjectTimelineStage | undefined>(undefined);
    const [isTaxAmountNA, setIsTaxAmountNA] = useState(false);

    const [prefillBid, setPrefillBid] = useState<PrefillBidState | null>(
        (location.state as {
            prefillBid?: PrefillBidState;
        } | null)?.prefillBid ?? null
    );

    const isPrefillMode = !!prefillBid || !!bidId;

    const isInvalid = (key: string) => !!errors[key];

    type ModalType = "success" | "error" | "warning" | "info";

    const [modal, setModal] = useState<{
        open: boolean;
        type: ModalType;
        title: string;
        message: string;
        successDestination?: string;
    }>({
        open: false,
        type: "info",
        title: "",
        message: "",
    });

    const showModal = (
        type: ModalType,
        title: string,
        message: string,
        successDestination?: string
    ) => {
        setModal({ open: true, type, title, message, successDestination });
    };

    const navigateWithScrollReset = (path: string) => {
        navigate(path);
        window.setTimeout(() => {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }, 0);
    };

    const navigateBack = () => {
        navigateWithScrollReset(currentBidId || bidId ? `/bids/${currentBidId || bidId}` : "/dashboard");
    };

    /** --------------------------------------------------
     * AUTO-LOAD USER PROFILE INTO COMPANY FIELDS
     ---------------------------------------------------*/
    useEffect(() => {
        if (!profile || isPrefillMode) return;

        setForm((prev) => ({
            ...prev,
            company_name: profile.companyName ?? prev.company_name,
            company_address: profile.companyAddress ?? prev.company_address,
            company_phone: profile.phone
                ? formatPhone(profile.phone)
                : prev.company_phone,
            company_email: profile.email ?? prev.company_email,
            company_slogan: profile.slogan ?? prev.company_slogan,
        }));

        // Clear any validation errors for these fields once we auto-populate
        setErrors((prev) => ({
            ...prev,
            company_name: false,
            company_address: false,
            company_phone: false,
            company_email: false,
        }));
    }, [profile, isPrefillMode]);

    useEffect(() => {
        if (!bidId) return;

        const unsubscribe = onSnapshot(doc(firestore, "bidForms", bidId), (snapshot) => {
            if (!snapshot.exists()) return;

            const bid = {
                id: snapshot.id,
                ...(snapshot.data() as {
                    status?: BidRecordStatus;
                    projectTimelineStage?: BidProjectTimelineStage;
                    formSnapshot: ExtendedBidFormState;
                    lineItems: LineItem[];
                }),
            };

            setPrefillBid({
                id: bid.id,
                status: bid.status,
                projectTimelineStage: bid.projectTimelineStage,
                formSnapshot: bid.formSnapshot,
                lineItems: bid.lineItems,
            });
        });

        return unsubscribe;
    }, [bidId]);

    useEffect(() => {
        if (!prefillBid) return;

        setCurrentBidId(prefillBid.id ?? null);
        setCurrentProjectTimelineStage(prefillBid.projectTimelineStage);

        setForm((prev) => ({
            ...prev,
            ...prefillBid.formSnapshot,
            tax_percentage:
                prefillBid.formSnapshot.tax_percentage === "N/A"
                    ? initialFormState.tax_percentage
                    : prefillBid.formSnapshot.tax_percentage || initialFormState.tax_percentage,
            company_phone: prefillBid.formSnapshot.company_phone
                ? formatPhone(prefillBid.formSnapshot.company_phone)
                : "",
            customer_phone:
                prefillBid.formSnapshot.customer_phone === "N/A"
                    ? "N/A"
                    : prefillBid.formSnapshot.customer_phone
                        ? formatPhone(prefillBid.formSnapshot.customer_phone)
                        : "",
        }));

        setLineItems(prefillBid.lineItems || []);
        setNumLineItems(String(prefillBid.lineItems?.length || ""));
        setIsTaxAmountNA(prefillBid.formSnapshot.tax_percentage === "N/A");
        setErrors({});
    }, [prefillBid]);

    useEffect(() => {
        if (lineItems.length < 2) {
            setIsLineItemReorderMode(false);
        }
    }, [lineItems.length]);

    const buildBidTitle = () => {
        const customerName = form.customer_name.trim();
        const jobName = form.job.trim();
        const titleParts = [jobName, customerName].filter(Boolean);

        return titleParts.length > 0 ? titleParts.join(" - ") : "Draft";
    };

    const resolveProjectTimelineStage = (status: BidRecordStatus): BidProjectTimelineStage => {
        if (status === "draft") {
            return "draft";
        }

        if (!currentProjectTimelineStage || currentProjectTimelineStage === "draft") {
            return "created";
        }

        return currentProjectTimelineStage;
    };

    const persistBidRecord = async (status: BidRecordStatus) => {
        if (!user) {
            throw new Error("User must be signed in to save a bid.");
        }

        const nextProjectTimelineStage = resolveProjectTimelineStage(status);

        const bidData = {
            userId: user.uid,
            title: buildBidTitle(),
            status,
            projectTimelineStage: nextProjectTimelineStage,
            workspaceOverviewStatus: "generating" as const,
            workspaceOverviewSummary: "",
            formSnapshot: form,
            lineItems,
            updatedAt: serverTimestamp(),
        };

        if (currentBidId) {
            await updateDoc(doc(firestore, "bidForms", currentBidId), bidData);
            setCurrentProjectTimelineStage(nextProjectTimelineStage);
            return currentBidId;
        }

        const createdDoc = await addDoc(collection(firestore, "bidForms"), {
            ...bidData,
            createdAt: serverTimestamp(),
        });

        setCurrentBidId(createdDoc.id);
        setCurrentProjectTimelineStage(nextProjectTimelineStage);
        return createdDoc.id;
    };

    const refreshBidWorkspaceOverviewRecord = async (bidFormId: string) => {
        try {
            const summary = await generateBidWorkspaceOverviewSummary(
                {
                    title: buildBidTitle(),
                    formSnapshot: form,
                    lineItems,
                }
            );

            await updateDoc(doc(firestore, "bidForms", bidFormId), {
                workspaceOverviewSummary: summary,
                workspaceOverviewStatus: "ready",
                workspaceOverviewUpdatedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        } catch (error) {
            console.error("Failed to refresh bid workspace overview:", error);

            await updateDoc(doc(firestore, "bidForms", bidFormId), {
                workspaceOverviewStatus: "error",
                updatedAt: serverTimestamp(),
            });
        }
    };

    const persistBidFormProposalRecord = async (
        bidFormId: string,
        payload: Record<string, unknown>
    ) => {
        if (!user) {
            throw new Error("User must be signed in to generate a proposal.");
        }

        const proposalData = {
            userId: user.uid,
            bidFormId,
            title: buildBidTitle(),
            status: "generating" as const,
            sourcePayload: payload,
            errorMessage: "",
            updatedAt: serverTimestamp(),
        };

        const existingProposalQuery = query(
            collection(firestore, "bidFormProposals"),
            where("userId", "==", user.uid),
            where("bidFormId", "==", bidFormId)
        );
        const existingProposalSnapshot = await getDocs(existingProposalQuery);
        const existingProposalDoc = existingProposalSnapshot.docs[0];

        if (existingProposalDoc) {
            await updateDoc(doc(firestore, "bidFormProposals", existingProposalDoc.id), proposalData);
            return existingProposalDoc.id;
        }

        const createdDoc = await addDoc(collection(firestore, "bidFormProposals"), {
            ...proposalData,
            createdAt: serverTimestamp(),
        });

        return createdDoc.id;
    };

    const generateBidFormProposalRecord = async (
        bidFormId: string,
        bidFormProposalId: string,
        payload: Record<string, unknown>
    ) => {
        try {
            const res = await fetch(`${getFunctionsBaseUrl()}/generateBidFormProposal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payload }),
            });

            const data = await res.json();

            if (!res.ok || !data?.documentData) {
                throw new Error(
                    data?.error || "We ran into an issue generating the proposal."
                );
            }

            await updateDoc(doc(firestore, "bidFormProposals", bidFormProposalId), {
                status: "ready",
                documentData: data.documentData,
                html: renderBidEditorHtml(data.documentData),
                updatedAt: serverTimestamp(),
                errorMessage: "",
            });
            await touchBidFormUpdatedAt(bidFormId);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "We ran into an issue generating the proposal.";

            await updateDoc(doc(firestore, "bidFormProposals", bidFormProposalId), {
                status: "error",
                errorMessage: message,
                updatedAt: serverTimestamp(),
            });
            await touchBidFormUpdatedAt(bidFormId);
        }
    };

    /** -------------------------------
     * FORMAT PHONE FIELD
     --------------------------------*/
    const formatPhone = (value: string) => {
        const digits = value.replace(/\D/g, "").slice(0, 10);

        if (digits.length <= 3) return digits;
        if (digits.length <= 6) {
            return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        }

        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    };

    /** -------------------------------
     * FORMAT DOLLAR INPUT ($ + commas only)
    --------------------------------*/
    const formatDollarWithCommas = (value: string | number) => {
        const cleaned = String(value).replace(/[^0-9.]/g, "");
        if (!cleaned) return "";
        const number = Number(cleaned);
        if (isNaN(number)) return "";
        return `$${number.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    };

    const formatDollarInput = (value: string) => {
        let cleaned = value.replace(/[^0-9.]/g, "");

        const parts = cleaned.split(".");
        if (parts.length > 2) {
            cleaned = parts[0] + "." + parts.slice(1).join("");
        }

        const [integerPart, decimalPart] = cleaned.split(".");

        const formattedInteger = integerPart
            ? Number(integerPart).toLocaleString("en-US")
            : "";

        if (decimalPart !== undefined) {
            return `$${formattedInteger}.${decimalPart.slice(0, 2)}`;
        }

        return `$${formattedInteger}`;
    };

    const parseMoney = (value: string | number) =>
        Number(String(value).replace(/[^0-9.]/g, "")) || 0;

    const parsePercent = (value: string) =>
        Number(value.replace(/[^0-9.]/g, "")) || 0;

    const parseFormattedMoney = (value: string | number) =>
        Number(String(value).replace(/[^0-9.]/g, "")) || 0;

    const roundMoney = (value: number) => Math.round(value * 100) / 100;

    /** -------------------------------
     * AUTO CALCULATE TOTAL COSTS (subtotal + contingency + tax)
     --------------------------------*/
    const subtotal = lineItems.reduce(
        (sum, item) => sum + parseMoney(item.line_total),
        0
    );

    const taxPct = parsePercent(form.tax_percentage);
    const contingencyPct = parsePercent(form.contingency_percentage);

    const taxAmount = isTaxAmountNA ? 0 : roundMoney(subtotal * (taxPct / 100));

    const contingencyAmount = roundMoney(subtotal * (contingencyPct / 100));

    const totalWithExtras = roundMoney(subtotal + taxAmount + contingencyAmount);

    const depositPct = parsePercent(form.deposit_percentage);

    const depositAmount = roundMoney(totalWithExtras * (depositPct / 100));

    const weeklyCount =
        Number(String(form.weekly_payments).replace(/[^0-9]/g, "")) || 0;

    const remainingAfterDeposit = roundMoney(totalWithExtras - depositAmount);

    const weeklyAmount =
        weeklyCount > 0 && remainingAfterDeposit > 0
            ? roundMoney(remainingAfterDeposit / weeklyCount)
            : 0;

    useEffect(() => {
        // keep total_costs always in sync with line items + contingency + tax
        setForm((prev) => ({
            ...prev,
            total_costs: totalWithExtras > 0 ? formatDollarWithCommas(totalWithExtras) : "",
        }));

        // clear "total_costs" error once it becomes computed
        if (totalWithExtras > 0) {
            setErrors((prev) => ({ ...prev, total_costs: false }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTaxAmountNA, lineItems, form.tax_percentage, form.contingency_percentage]);

    /** -------------------------------
     * SET FIELD TO N/A
     --------------------------------*/
    const handleSetNA = (field: "customer_phone" | "customer_email") => {
        setForm((prev) => {
            const isNA = prev[field] === "N/A";

            return {
                ...prev,
                [field]: isNA ? "" : "N/A",
            };
        });

        setErrors((prev) => ({
            ...prev,
            [field]: false,
        }));
    };

    const handleSetTaxAmountNA = () => {
        setIsTaxAmountNA((prev) => {
            const nextIsNA = !prev;

            setForm((current) => ({
                ...current,
                tax_percentage: nextIsNA ? "N/A" : initialFormState.tax_percentage,
            }));

            return nextIsNA;
        });
        setErrors((prev) => ({
            ...prev,
            tax_percentage: false,
        }));
    };

    /** -------------------------------
     * FORM CHANGE HANDLER
     --------------------------------*/
    const handleFormChange = (
        e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { id, value } = e.target;

        // clear error as soon as user edits the field
        setErrors((prev) => ({ ...prev, [id]: false }));

        // phones
        if (id === "company_phone" || id === "customer_phone") {
            if (value === "N/A") {
                setForm((prev) => ({ ...prev, [id]: "N/A" }));
                return;
            }

            setForm((prev) => ({ ...prev, [id]: formatPhone(value) }));
            return;
        }

        if (id === "tax_percentage" || id === "contingency_percentage") {
            const cleaned = value.replace(/[^0-9.]/g, "");
            setForm((prev) => ({ ...prev, [id]: cleaned }));
            return;
        }

        if (id === "deposit_percentage") {
            const cleaned = value.replace(/[^0-9.]/g, "");
            setForm((prev) => ({ ...prev, [id]: cleaned }));
            return;
        }

        // weekly payments = number only (count of weeks/payments)
        if (id === "weekly_payments") {
            const cleaned = value.replace(/[^0-9]/g, "");
            setForm((prev) => ({ ...prev, weekly_payments: cleaned }));
            return;
        }

        // ignore attempts to edit computed total_costs
        if (id === "total_costs") return;

        // default
        setForm((prev) => ({ ...prev, [id]: value }));
    };

    /** -------------------------------
     * GENERATE LINE ITEMS
     --------------------------------*/
    const handleGenerateLineItems = () => {
        const count = parseInt(numLineItems);
        if (!count || count < 1) {
            showModal(
                "warning",
                "Invalid Line Item Count",
                "Please enter a valid number of line items before generating sections."
            );

            return;
        }

        setLineItems((prev) => {
            if (count === prev.length) return prev;

            if (count < prev.length) {
                return prev.slice(0, count);
            }

            const additionalItems = Array.from(
                { length: count - prev.length },
                () => ({ ...emptyLineItem })
            );

            return [...prev, ...additionalItems];
        });

        // Clear line item validation errors when re-generating
        setErrors((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((k) => {
                if (k.startsWith("line_")) delete next[k];
            });
            return next;
        });

        // if they generate line items, clear the "missing line items" error
        setErrors((prev) => ({ ...prev, line_items_missing: false }));
    };

    /** -------------------------------
     * LINE ITEM CHANGE
     --------------------------------*/
    const handleLineItemChange = (
        index: number,
        field: keyof LineItem,
        value: string
    ) => {
        setLineItems((prev) =>
            prev.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        );

        // clear specific line-item error on change
        const key = `line_${field}_${index}`;
        setErrors((prev) => ({ ...prev, [key]: false }));
    };

    const handleDeleteLineItem = (indexToDelete: number) => {
        setLineItems((prev) => {
            const nextLineItems = prev.filter((_, index) => index !== indexToDelete);
            setNumLineItems(nextLineItems.length ? String(nextLineItems.length) : "");
            return nextLineItems;
        });
        handleLineItemDragEnd();

        setErrors((prev) => {
            const next: FormErrors = {};

            Object.entries(prev).forEach(([key, value]) => {
                const match = key.match(/^line_(.+)_(\d+)$/);

                if (!match) {
                    next[key] = value;
                    return;
                }

                const errorIndex = Number(match[2]);

                if (errorIndex < indexToDelete) {
                    next[key] = value;
                    return;
                }

                if (errorIndex > indexToDelete) {
                    next[`line_${match[1]}_${errorIndex - 1}`] = value;
                }
            });

            return next;
        });
    };

    const handleLineItemDragStart = (
        index: number,
        event: DragEvent<HTMLButtonElement>
    ) => {
        setDraggedLineItemIndex(index);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
    };

    const handleLineItemDragOver = (
        index: number,
        event: DragEvent<HTMLDivElement>
    ) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setLineItemDragOverIndex(index);
    };

    const handleLineItemDragEnd = () => {
        setDraggedLineItemIndex(null);
        setLineItemDragOverIndex(null);
    };

    const moveLineItem = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) return;

        setLineItems((prev) => {
            if (
                fromIndex < 0 ||
                toIndex < 0 ||
                fromIndex >= prev.length ||
                toIndex >= prev.length
            ) {
                return prev;
            }

            const next = [...prev];
            const [movedItem] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, movedItem);
            return next;
        });

        setErrors((prev) => {
            const next: FormErrors = {};

            Object.entries(prev).forEach(([key, value]) => {
                const match = key.match(/^line_(.+)_(\d+)$/);

                if (!match) {
                    next[key] = value;
                    return;
                }

                const errorIndex = Number(match[2]);
                let nextIndex = errorIndex;

                if (errorIndex === fromIndex) {
                    nextIndex = toIndex;
                } else if (fromIndex < toIndex && errorIndex > fromIndex && errorIndex <= toIndex) {
                    nextIndex = errorIndex - 1;
                } else if (fromIndex > toIndex && errorIndex >= toIndex && errorIndex < fromIndex) {
                    nextIndex = errorIndex + 1;
                }

                next[`line_${match[1]}_${nextIndex}`] = value;
            });

            return next;
        });
    };

    const handleLineItemDrop = (
        index: number,
        event: DragEvent<HTMLDivElement>
    ) => {
        event.preventDefault();
        const transferredIndex = event.dataTransfer.getData("text/plain");
        const fromIndex = draggedLineItemIndex ?? (
            transferredIndex ? Number(transferredIndex) : null
        );

        if (fromIndex !== null && Number.isInteger(fromIndex)) {
            moveLineItem(fromIndex, index);
        }

        handleLineItemDragEnd();
    };

    /** -------------------------------
     * BULLET LIST BEHAVIOR
     --------------------------------*/
    const handleScopeKeyDown = (
        index: number,
        e: KeyboardEvent<HTMLTextAreaElement>
    ) => {
        if (e.key === "Enter") {
            e.preventDefault();

            const current = lineItems[index].scope;
            const cursorPos = (e.target as HTMLTextAreaElement).selectionStart;

            const before = current.substring(0, cursorPos);
            const after = current.substring(cursorPos);

            const newValue = before + "\n- " + after;
            handleLineItemChange(index, "scope", newValue);

            setTimeout(() => {
                const textarea = e.target as HTMLTextAreaElement;
                textarea.selectionStart = cursorPos + 3;
                textarea.selectionEnd = cursorPos + 3;
            }, 0);
        }
    };

    const handleScopeChange = (
        index: number,
        e: ChangeEvent<HTMLTextAreaElement>
    ) => {
        let value = e.target.value;

        if (lineItems[index].scope === "" && value.length === 1) {
            value = "- " + value;
        }

        handleLineItemChange(index, "scope", value);
    };

    /** -------------------------------
     * EMAIL VALIDATION (format check only)
     --------------------------------*/
    const validateEmail = (e: FocusEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (!value || value === "N/A") return;

        const valid = /\S+@\S+\.\S+/.test(value);
        if (!valid) {
            showModal(
                "warning",
                "Invalid Email Address",
                "Please enter a valid email address so we can deliver your bid."
            );
        }
    };

    /** -------------------------------
     * REQUIRED FIELD VALIDATION
     --------------------------------*/
    const validateForm = () => {
        const newErrors: FormErrors = {};

        const req = (key: keyof ExtendedBidFormState) => {
            if (!String(form[key] ?? "").trim()) newErrors[String(key)] = true;
        };

        // All form fields required (as requested)
        req("company_name");
        req("company_address");
        req("company_phone");
        req("company_email");
        req("invoice_date");
        req("invoice_number");
        req("salesperson");
        req("job");
        req("payment_terms");
        req("approx_weeks");

        // Contingency fields required
        req("contingency_percentage");
        req("contingency_coverage");

        // Tax field required unless explicitly marked N/A
        req("tax_percentage");

        // total_costs is required but computed; still enforce existence
        req("total_costs");

        req("deposit_percentage");
        req("weekly_payments");
        req("customer_name");
        req("customer_address");

        // Customer phone/email only required when not marked N/A
        if (!String(form.customer_phone ?? "").trim()) {
            newErrors["customer_phone"] = true;
        }

        if (!String(form.customer_email ?? "").trim()) {
            newErrors["customer_email"] = true;
        }

        // Line items required: must exist AND each one must be complete
        if (!lineItems.length) {
            newErrors["line_items_missing"] = true;
        } else {
            lineItems.forEach((li, idx) => {
                if (!String(li.trade ?? "").trim()) newErrors[`line_trade_${idx}`] = true;
                if (!String(li.scope ?? "").trim()) newErrors[`line_scope_${idx}`] = true;
                if (!String(li.material_labor_included ?? "").trim())
                    newErrors[`line_material_labor_included_${idx}`] = true;
                if (!String(li.line_total ?? "").trim()) newErrors[`line_line_total_${idx}`] = true;
            });
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    /** -------------------------------
    * EXTRACT ZIPCODE FROM CUSTOMER ADDRESS
    --------------------------------*/
    const extractZipCode = (address: string): string | null => {
        const match = address.match(/\b\d{5}\b/);
        return match ? match[0] : null;
    };

    /** -------------------------------
     * SUBMIT FORM
     --------------------------------*/
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (isSubmitting) return;

        if (!validateForm()) {
            showModal(
                "warning",
                "Incomplete Form",
                "Please complete all required fields before submitting your bid."
            );
            return;
        }

        setIsSubmitting(true);

        const convertMoney = (v: string | number) =>
            Number(String(v).replace(/[^0-9.]/g, "")) || 0;

        const preparedLineItems = lineItems.map((item) => ({
            trade: item.trade,
            scope: item.scope.split(/\r?\n/).filter(Boolean),
            material_labor_included: item.material_labor_included,
            line_total: convertMoney(item.line_total),
        }));

        const payload = {
            ...form,
            tax_percentage: isTaxAmountNA ? "N/A" : taxPct,
            contingency_percentage: contingencyPct,
            tax_amount: isTaxAmountNA ? "N/A" : taxAmount,
            contingency_amount: contingencyAmount,
            approx_weeks: form.approx_weeks,
            total_costs: parseFormattedMoney(form.total_costs),
            deposit_percentage: depositPct,
            deposit_amount: depositAmount,
            weekly_payments: weeklyCount,
            weekly_amount: weeklyAmount,
            line_items: preparedLineItems,
            subtotal: subtotal,
        };

        try {
            const bidFormId = await persistBidRecord("submitted");
            await refreshBidWorkspaceOverviewRecord(bidFormId);
            const bidFormProposalId = await persistBidFormProposalRecord(bidFormId, payload);

            setIsSubmitting(false);

            void generateBidFormProposalRecord(bidFormId, bidFormProposalId, payload);

            showModal(
                "success",
                "Bid Submitted Successfully",
                "Your bid form has been saved and the proposal is being generated.",
                `/bids/${bidFormId}/bid-proposal`
            );
        } catch (err) {
            setIsSubmitting(false); // ✅ stop loading on error

            showModal(
                "error",
                "Network Error",
                "We could not create your proposal. Please check your connection and try again."
            );
        }
    };

    const handleSaveDraft = async () => {
        if (isSubmitting) return;

        setIsSubmitting(true);

        try {
            const bidFormId = await persistBidRecord("draft");
            await refreshBidWorkspaceOverviewRecord(bidFormId);
            setIsSubmitting(false);

            showModal(
                "success",
                "Draft Saved",
                "Your bid draft has been saved. You can come back and finish it later from Bid History.",
                `/bids/${bidFormId}`
            );
        } catch (err) {
            setIsSubmitting(false);

            showModal(
                "error",
                "Draft Save Failed",
                "We ran into an issue while saving your draft. Please try again in a moment."
            );
        }
    };

    return (
        (loading || !profile) ?
            <div className="suros-gradient">
                <div
                    style={{
                        padding: "40px",
                        color: "#fff",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "16px",
                    }}
                >
                    <div>Loading company profile info for your form…</div>

                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            background: "#1e73be",
                            color: "#fff",
                            padding: "10px 22px",
                            borderRadius: "6px",
                            border: "none",
                            fontSize: "15px",
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        Refresh
                    </button>
                </div>
            </div>
            :
            <div className="suros-gradient">
                <div className="bid-form-page">
                    <button
                        onClick={navigateBack}
                        style={{
                            position: "fixed",
                            top: "20px",
                            left: "20px",
                            background: "#1e73be",
                            color: "#fff",
                            padding: "10px 18px",
                            fontSize: "15px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: 600,
                            border: "none",
                            zIndex: 10
                        }}
                    >
                        ← Back
                    </button>

                    <div className="page-bg">
                        <div className="container">

                            <div className="logo">
                                <img src={surosLogo} alt="Suros Logic Systems Logo" />
                            </div>

                            <h1>
                                <b>{form.company_name}</b>
                            </h1>

                            <div className="header-info">
                                <label>Address:</label>
                                <input
                                    type="text"
                                    id="company_address"
                                    value={form.company_address}
                                    onChange={handleFormChange}
                                    className={isInvalid("company_address") ? "input-error" : ""}
                                />

                                <label>Phone:</label>
                                <input
                                    type="text"
                                    id="company_phone"
                                    value={form.company_phone}
                                    onChange={handleFormChange}
                                    className={isInvalid("company_phone") ? "input-error" : ""}
                                />

                                <label>Email:</label>
                                <input
                                    type="email"
                                    id="company_email"
                                    value={form.company_email}
                                    onChange={handleFormChange}
                                    onBlur={validateEmail}
                                    className={isInvalid("company_email") ? "input-error" : ""}
                                />

                                <p className="slogan">{form.company_slogan}</p>

                                {isInvalid("company_name") && (
                                    <div className="field-error-text">Company name is required.</div>
                                )}
                            </div>

                            <form onSubmit={handleSubmit}>
                                <h2>Invoice Information</h2>

                                <label>Invoice Date:</label>
                                <input
                                    type="date"
                                    id="invoice_date"
                                    value={form.invoice_date}
                                    onChange={handleFormChange}
                                    className={isInvalid("invoice_date") ? "input-error" : ""}
                                />

                                <label>Invoice #:</label>
                                <input
                                    type="text"
                                    id="invoice_number"
                                    placeholder="SLS-2026-1178"
                                    value={form.invoice_number}
                                    onChange={handleFormChange}
                                    className={isInvalid("invoice_number") ? "input-error" : ""}
                                />

                                <h2>Customer Info</h2>

                                <label>Customer Name:</label>
                                <input
                                    type="text"
                                    id="customer_name"
                                    value={form.customer_name}
                                    onChange={handleFormChange}
                                    placeholder="John Doe"
                                    className={isInvalid("customer_name") ? "input-error" : ""}
                                />

                                <label>Customer Address:</label>
                                <input
                                    type="text"
                                    id="customer_address"
                                    value={form.customer_address}
                                    onChange={handleFormChange}
                                    placeholder="1234 Main St, Tampa FL"
                                    className={isInvalid("customer_address") ? "input-error" : ""}
                                />

                                <label>Customer Phone:</label>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        width: "100%",
                                    }}
                                >
                                    <input
                                        type="text"
                                        id="customer_phone"
                                        value={form.customer_phone}
                                        onChange={handleFormChange}
                                        placeholder="000-000-0000"
                                        readOnly={form.customer_phone === "N/A"}
                                        title={form.customer_phone === "N/A" ? "This field cannot be edited when N/A is selected" : ""}
                                        className={`${isInvalid("customer_phone") ? "input-error" : ""} ${form.customer_phone === "N/A" ? "input-readonly" : ""}`}
                                        style={{ flex: 1 }}
                                    />

                                    <button
                                        type="button"
                                        onClick={() => handleSetNA("customer_phone")}
                                        style={{
                                            whiteSpace: "nowrap",
                                            padding: "10px 14px",
                                            background: form.customer_phone === "N/A" ? "#1e73be" : "#e5e7eb",
                                            color: form.customer_phone === "N/A" ? "#fff" : "#111",
                                            border: "none",
                                            borderRadius: "6px",
                                            cursor: "pointer",
                                            fontWeight: 600,
                                            opacity: form.customer_phone === "N/A" ? 1 : 0.85,
                                            position: "relative",
                                            top: "-4px"
                                        }}
                                    >
                                        N/A
                                    </button>
                                </div>

                                <label>Customer Email:</label>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        width: "100%",
                                    }}
                                >
                                    <input
                                        type="email"
                                        id="customer_email"
                                        value={form.customer_email}
                                        onChange={handleFormChange}
                                        onBlur={validateEmail}
                                        placeholder="example@email.com"
                                        readOnly={form.customer_email === "N/A"}
                                        title={form.customer_email === "N/A" ? "This field cannot be edited when N/A is selected" : ""}
                                        className={`${isInvalid("customer_email") ? "input-error" : ""} ${form.customer_email === "N/A" ? "input-readonly" : ""}`}
                                        style={{ flex: 1 }}
                                    />

                                    <button
                                        type="button"
                                        onClick={() => handleSetNA("customer_email")}
                                        style={{
                                            whiteSpace: "nowrap",
                                            padding: "10px 14px",
                                            background: form.customer_email === "N/A" ? "#1e73be" : "#e5e7eb",
                                            color: form.customer_email === "N/A" ? "#fff" : "#111",
                                            border: "none",
                                            borderRadius: "6px",
                                            cursor: "pointer",
                                            fontWeight: 600,
                                            opacity: form.customer_email === "N/A" ? 1 : 0.85,
                                            position: "relative",
                                            top: "-4px"
                                        }}
                                    >
                                        N/A
                                    </button>
                                </div>

                                <h2>Project & Payment Info</h2>

                                <label>Salesperson Name:</label>
                                <input
                                    type="text"
                                    id="salesperson"
                                    placeholder="John Doe"
                                    value={form.salesperson}
                                    onChange={handleFormChange}
                                    className={isInvalid("salesperson") ? "input-error" : ""}
                                />

                                <label>Job Name or Address:</label>
                                <input
                                    type="text"
                                    id="job"
                                    placeholder="Kitchen Remodel, Tampa FL"
                                    value={form.job}
                                    onChange={handleFormChange}
                                    className={isInvalid("job") ? "input-error" : ""}
                                />

                                <label><strong>Payment Terms:</strong></label>
                                <textarea
                                    id="payment_terms"
                                    rows={2}
                                    value={form.payment_terms}
                                    onChange={handleFormChange}
                                    placeholder="Deposit of 50% prior to work commencing and weekly progress payments."
                                    className={isInvalid("payment_terms") ? "input-error" : ""}
                                ></textarea>

                                <label>Approximate Working Weeks:</label>
                                <input
                                    type="text"
                                    id="approx_weeks"
                                    value={form.approx_weeks}
                                    onChange={handleFormChange}
                                    placeholder="4 - 6"
                                    className={isInvalid("approx_weeks") ? "input-error" : ""}
                                />

                                <h2>Line Items</h2>

                                <label>How many line items (trades)?</label>
                                <input
                                    type="number"
                                    id="num_line_items"
                                    min={1}
                                    max={20}
                                    value={numLineItems}
                                    onChange={(e) => {
                                        setNumLineItems(e.target.value);
                                        setErrors((prev) => ({ ...prev, line_items_missing: false }));
                                    }}
                                    className={[
                                        "line-item-count-input",
                                        isInvalid("line_items_missing") ? "input-error" : "",
                                    ].filter(Boolean).join(" ")}
                                />

                                <div className="line-item-toolbar">
                                    <button type="button" onClick={handleGenerateLineItems}>
                                        Generate Line Item Sections
                                    </button>

                                    {lineItems.length > 1 && (
                                        <button
                                            type="button"
                                            className="line-item-reorder-toggle"
                                            onClick={() => {
                                                handleLineItemDragEnd();
                                                setIsLineItemReorderMode((prev) => !prev);
                                            }}
                                        >
                                            {isLineItemReorderMode ? "Done Reordering" : "Reorder"}
                                        </button>
                                    )}
                                </div>

                                {isInvalid("line_items_missing") && (
                                    <div className="field-error-text">
                                        Please generate at least one line item.
                                    </div>
                                )}

                                {isLineItemReorderMode ? (
                                    <div className="line-item-reorder-panel">
                                        {lineItems.map((item, index) => (
                                            <div
                                                key={index}
                                                className={[
                                                    "line-item-reorder-row",
                                                    draggedLineItemIndex === index
                                                        ? "line-item-reorder-row-dragging"
                                                        : "",
                                                    lineItemDragOverIndex === index && draggedLineItemIndex !== index
                                                        ? "line-item-reorder-row-drag-over"
                                                        : "",
                                                ].filter(Boolean).join(" ")}
                                                onDragOver={(event) => handleLineItemDragOver(index, event)}
                                                onDrop={(event) => handleLineItemDrop(index, event)}
                                            >
                                                <button
                                                    type="button"
                                                    className="line-item-reorder-drag-button"
                                                    draggable
                                                    onDragStart={(event) =>
                                                        handleLineItemDragStart(index, event)
                                                    }
                                                    onDragEnd={handleLineItemDragEnd}
                                                    aria-label={`Reorder line item ${index + 1}`}
                                                    title="Drag to reorder line item"
                                                >
                                                    <GripVertical size={18} aria-hidden="true" />
                                                </button>

                                                <span className="line-item-reorder-number">{index + 1}</span>
                                                <span className="line-item-reorder-trade">
                                                    {item.trade.trim() || `Line Item ${index + 1}`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div id="lineItemsContainer">
                                    {lineItems.map((item, index) => {
                                        const placeholderTrade =
                                            placeholderTrades[index % placeholderTrades.length];

                                        return (
                                            <div
                                                key={index}
                                                className="line-item"
                                            >
                                                <button
                                                    type="button"
                                                    className="line-item-delete-button"
                                                    onClick={() => handleDeleteLineItem(index)}
                                                    aria-label={`Delete line item ${index + 1}`}
                                                    title="Delete line item"
                                                >
                                                    <Trash2 size={18} aria-hidden="true" />
                                                </button>

                                                <h3>LINE ITEM {index + 1}</h3>

                                                <label>Trade Name:</label>
                                                <input
                                                    type="text"
                                                    placeholder={placeholderTrade}
                                                    value={item.trade}
                                                    onChange={(e) =>
                                                        handleLineItemChange(index, "trade", e.target.value)
                                                    }
                                                    className={isInvalid(`line_trade_${index}`) ? "input-error" : ""}
                                                />

                                                <label>Scope of Work (one per line):</label>
                                                <textarea
                                                    className={
                                                        `scope-input ${isInvalid(`line_scope_${index}`) ? "input-error" : ""}`
                                                    }
                                                    placeholder="- Enter one task per line"
                                                    value={item.scope}
                                                    onChange={(e) => handleScopeChange(index, e)}
                                                    onKeyDown={(e) => handleScopeKeyDown(index, e)}
                                                ></textarea>

                                                <label>Material and Labor Included?</label>
                                                <select
                                                    value={item.material_labor_included}
                                                    onChange={(e) =>
                                                        handleLineItemChange(
                                                            index,
                                                            "material_labor_included",
                                                            e.target.value
                                                        )
                                                    }
                                                    className={
                                                        isInvalid(`line_material_labor_included_${index}`)
                                                            ? "input-error"
                                                            : ""
                                                    }
                                                >
                                                    <option value="Yes">Yes</option>
                                                    <option value="No">No</option>
                                                </select>

                                                <label>Line Total ($):</label>

                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "flex-start",
                                                        position: "relative",
                                                        flexWrap: "wrap",
                                                        gap: "6px",
                                                    }}
                                                >
                                                    <input
                                                        type="text"
                                                        style={{
                                                            flex: "1 1 200px",
                                                            minWidth: "150px"
                                                        }}
                                                        placeholder="$"
                                                        value={item.line_total}
                                                        onChange={(e) =>
                                                            handleLineItemChange(
                                                                index,
                                                                "line_total",
                                                                formatDollarInput(e.target.value)
                                                            )
                                                        }
                                                        className={isInvalid(`line_line_total_${index}`) ? "input-error" : ""}
                                                    />

                                                    <LineItemAIHelper
                                                        tradeName={item.trade}
                                                        scope={item.scope}
                                                        zipCode={extractZipCode(form.company_address)}
                                                        onUpdateScope={(updatedScope) =>
                                                            handleLineItemChange(
                                                                index,
                                                                "scope",
                                                                updatedScope
                                                            )
                                                        }
                                                        onApplyTotal={(amount) =>
                                                            handleLineItemChange(
                                                                index,
                                                                "line_total",
                                                                formatDollarWithCommas(amount)
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                    </div>
                                )}

                                <h2>Contingency</h2>

                                <label>Contingency (%):</label>
                                <div className="tax-row">
                                    <div className="percent-input-wrapper">
                                        <input
                                            type="text"
                                            id="contingency_percentage"
                                            value={form.contingency_percentage}
                                            onChange={handleFormChange}
                                            placeholder="10"
                                            className={isInvalid("contingency_percentage") ? "input-error" : ""}
                                        />
                                        <span className="percent-suffix">%</span>
                                    </div>

                                    <div className="tax-amount text-black">
                                        {subtotal > 0 && contingencyPct > 0
                                            ? `${formatDollarWithCommas(
                                                contingencyAmount
                                            )} contingency`
                                            : ""}
                                    </div>
                                </div>

                                <textarea
                                    id="contingency_coverage"
                                    rows={3}
                                    value={form.contingency_coverage}
                                    onChange={handleFormChange}
                                    placeholder="Covers miscellaneous materials and unexpected repairs..."
                                    className={isInvalid("contingency_coverage") ? "input-error" : ""}
                                ></textarea>

                                <p className="contingency-warning">
                                    <strong>
                                        CONTINGENCY FUNDS NOT UTILIZED WILL BE RETURNED TO THE CUSTOMER.
                                    </strong>
                                </p>

                                <h2>Totals & Payment</h2>

                                <label>Tax (%):</label>
                                <div className="tax-row">
                                    <div className="percent-input-wrapper">
                                        <input
                                            type="text"
                                            id="tax_percentage"
                                            value={isTaxAmountNA ? "0" : form.tax_percentage}
                                            readOnly
                                            placeholder="7"
                                            className={`${isInvalid("tax_percentage") ? "input-error" : ""} input-readonly`}
                                        />
                                        <span className="percent-suffix">%</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleSetTaxAmountNA}
                                        style={{
                                            whiteSpace: "nowrap",
                                            padding: "10px 14px",
                                            background: isTaxAmountNA ? "#1e73be" : "#e5e7eb",
                                            color: isTaxAmountNA ? "#fff" : "#111",
                                            border: "none",
                                            borderRadius: "6px",
                                            cursor: "pointer",
                                            fontWeight: 600,
                                            opacity: isTaxAmountNA ? 1 : 0.85,
                                            marginTop: "-8px",
                                        }}
                                    >
                                        N/A
                                    </button>

                                    <div className="tax-amount text-black">
                                        {isTaxAmountNA
                                            ? "Tax marked N/A"
                                            : subtotal > 0 && taxPct > 0
                                            ? `${formatDollarWithCommas(taxAmount)} in taxes`
                                            : ""}
                                    </div>
                                </div>

                                <label>Total Costs (Line Items + Contingency + Tax):</label>
                                <input
                                    type="text"
                                    id="total_costs"
                                    value={form.total_costs}
                                    readOnly
                                    className={`${isInvalid("total_costs") ? "input-error" : ""} input-readonly`}
                                    placeholder="$"
                                />

                                <label>Deposit Required (%):</label>
                                <div className="tax-row">
                                    <div className="percent-input-wrapper">
                                        <input
                                            type="text"
                                            id="deposit_percentage"
                                            onChange={handleFormChange}
                                            value={form.deposit_percentage}
                                            placeholder="50"
                                            className={isInvalid("deposit_percentage") ? "input-error" : ""}
                                        />
                                        <span className="percent-suffix">%</span>
                                    </div>

                                    <div className="tax-amount text-black">
                                        {totalWithExtras > 0 && depositPct > 0
                                            ? `${formatDollarWithCommas(depositAmount)}`
                                            : ""}
                                    </div>
                                </div>

                                <label>Weekly Progress Payments:</label>
                                <div className="tax-row">
                                    <input
                                        type="text"
                                        id="weekly_payments"
                                        value={form.weekly_payments}
                                        onChange={handleFormChange}
                                        placeholder="3"
                                        className={isInvalid("weekly_payments") ? "input-error" : ""}
                                    />

                                    <div className="tax-amount text-black">
                                        {weeklyAmount > 0
                                            ? `${formatDollarWithCommas(weeklyAmount)}/week`
                                            : ""}
                                    </div>
                                </div>

                                <div className="submit-area">
                                    <button
                                        type="button"
                                        className="secondary-submit"
                                        onClick={handleSaveDraft}
                                        disabled={isSubmitting}
                                        style={{
                                            opacity: isSubmitting ? 0.7 : 1,
                                            cursor: isSubmitting ? "not-allowed" : "pointer",
                                        }}
                                    >
                                        {isSubmitting ? <span className="spinner" /> : "Save Draft"}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        style={{
                                            opacity: isSubmitting ? 0.7 : 1,
                                            cursor: isSubmitting ? "not-allowed" : "pointer",
                                        }}
                                    >
                                        {isSubmitting ? (
                                            <span className="spinner" />
                                        ) : (
                                            "Submit Bid"
                                        )}
                                    </button>
                                    <p className="powered">POWERED by Suros Logic Systems, LLC</p>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                {modal.open && (
                    <div
                        style={{
                            position: "fixed",
                            inset: 0,
                            backgroundColor: "rgba(0,0,0,0.55)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 9999,
                        }}
                    >
                        <div
                            style={{
                                background: "#fff",
                                borderRadius: "10px",
                                width: "100%",
                                maxWidth: "480px",
                                padding: "28px",
                                boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
                                textAlign: "center",
                            }}
                        >
                            <h2 style={{ marginBottom: "12px", color: "#000", fontWeight: "bold" }}>
                                {modal.type === "success" && "✅ "}
                                {modal.type === "error" && "❌ "}
                                {modal.type === "warning" && "⚠️ "}
                                {modal.type === "info" && "ℹ️ "}
                                {modal.title}
                            </h2>

                            <p
                                style={{ color: "#000", lineHeight: 1.6, marginBottom: "22px" }}
                                dangerouslySetInnerHTML={{ __html: modal.message }}
                            />

                            <button
                                onClick={() => {
                                    if (modal.type === "success") {
                                        const targetBidId = currentBidId || bidId;
                                        navigateWithScrollReset(
                                            modal.successDestination ||
                                            (targetBidId ? `/bids/${targetBidId}/bid-proposal` : "/bids")
                                        );
                                    } else {
                                        setModal((m) => ({ ...m, open: false }));
                                    }
                                }}
                                style={{
                                    background:
                                        modal.type === "success"
                                            ? "#1e73be"
                                            : modal.type === "error"
                                                ? "#c0392b"
                                                : "#1e73be",
                                    color: "#fff",
                                    padding: "10px 22px",
                                    borderRadius: "6px",
                                    border: "none",
                                    fontSize: "15px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                {modal.type === "success" ? "Finish" : "Got it"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
    );
};

export default BidForm;
