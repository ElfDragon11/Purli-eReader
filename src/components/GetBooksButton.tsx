import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ExternalLink } from "lucide-react";

const GetBooksButton = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button 
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 p-4 text-lg w-full"
      >
        <ExternalLink size={20} />
        Get Books at eBooks.com
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md bg-white p-6 rounded-lg shadow-md">
          <DialogHeader>
            <DialogTitle>Find DRM-Free Books</DialogTitle>
            <DialogDescription>
              You’re about to visit eBooks.com.  
              <br />
              Please make sure to choose books that are labeled <strong>DRM-Free</strong> so they work properly with Purli.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <a href="https://www.ebooks.com/en-us/" target="_blank" rel="noopener noreferrer">
              <Button>Continue to eBooks.com</Button>
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GetBooksButton;
