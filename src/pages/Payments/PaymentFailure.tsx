import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import surosLogo from "@/assets/suros-logo-new.png";
import { useNavigate } from "react-router-dom";

const PaymentFailure = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-lg w-full text-center space-y-6">
        <img src={surosLogo} alt="Suros Logic" className="h-14 mx-auto" />

        <XCircle className="mx-auto text-secondary" size={72} />

        <h1 className="text-4xl font-bold">
          Payment Canceled
        </h1>

        <p className="text-muted-foreground text-lg">
          No charges were made. If this was a mistake, you can try again anytime.
        </p>

        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={() => navigate("/")}
        >
          Return Home
        </Button>
      </div>
    </div>
  );
};

export default PaymentFailure;
