export function TermsContent({ showRoleNote = false }: { showRoleNote?: boolean }) {
  return (
    <section id="terms" className="border-b border-[#2C2D3A] pb-10">
      <h2 className="font-heading text-2xl font-semibold">Terms & Conditions</h2>
      <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">
        These Terms & Conditions apply when you use ChudACO or submit an Auto Checkout (ACO) account. By doing so, you confirm that you have read and agree to these terms. If you do not agree, do not submit an account or use the service.
      </p>
      <div className="mt-4 flex max-w-[68ch] gap-3 rounded-lg border border-[#5C4A1A] bg-[#332B12] px-4 py-3 text-sm text-[#FFCB3C]">
        <span className="font-mono">!</span>
        <span>ChudACO may update these terms. Material changes will be posted here; continued use after the updated terms take effect means you accept them.</span>
      </div>

      <h3 className="mt-6 font-heading text-lg font-semibold">Service & Authorization</h3>
      <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#D7D6E4]">
        <li>ChudACO provides tools and operational support to attempt automated checkouts for products you request. A checkout attempt is not a guarantee that an order will be placed or fulfilled.</li>
        <li>When you submit an ACO account, you authorize ChudACO and its checkout operators to access that account and use the account, contact, shipping, and payment details you provide to attempt checkout of the requested product. You remain the retailer account holder and purchaser.</li>
        <li>You confirm that you own or are authorized to use every account, email address, payment method, and other information you submit. Do not submit another person&apos;s information without their permission.</li>
        <li>You are responsible for checking that the requested product, quantity, size, color, shipping address, and payment details are correct. ChudACO may decline, pause, or cancel an entry or order if it reasonably appears to be erroneous, duplicate, unauthorized, fraudulent, or unlawful.</li>
      </ul>

      <h3 className="mt-6 font-heading text-lg font-semibold">Checkout Risks & Account Responsibilities</h3>
      <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#D7D6E4]">
        <li>Checkouts depend on inventory, retailer systems, queues, payment authorization, network conditions, and other factors outside ChudACO&apos;s control. We do not guarantee availability, successful checkout, order acceptance, or delivery.</li>
        <li>Retailers control their accounts, orders, payments, shipping, cancellations, and returns. Automated checkout activity may lead a retailer to reject or cancel an order, limit an account, or take other action under its policies. You are responsible for reviewing and following the retailer&apos;s terms.</li>
        <li>Keep the details you submit accurate and current. Incorrect, expired, duplicate, or incomplete information can cause a checkout to fail or an order to be cancelled. Avoid changing account details or interfering with an active checkout attempt.</li>
        <li>ChudACO is not responsible for retailer decisions or service interruptions outside its reasonable control. This does not exclude responsibility that cannot legally be excluded.</li>
      </ul>

      <h3 className="mt-6 font-heading text-lg font-semibold">Pay After Success (PAS)</h3>
      <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#D7D6E4]">
        <li>You owe the PAS fee shown for your account when ChudACO successfully places the requested order. Failed or missed attempts are not billed. The current fee schedule is shown in the dashboard and may be updated for future checkout attempts.</li>
        <li>ChudACO will contact you about a successful checkout within 24 hours. Payment is due within 48 hours of that notice using the payment method or instructions provided by ChudACO.</li>
        <li>If payment is not received by the deadline, the balance remains due and ChudACO may pause or restrict your access or future ACO entries until it is paid. ChudACO may cancel an order where cancellation is still available, such as at the Pokemon Center, and report the account to the respective retailer.</li>
        <li>If the retailer cancels an order, provide ChudACO with proof of cancellation to request a refund of the PAS fee. If you ask the retailer to cancel, or cancel for another reason within your control, the fee remains due. After an order ships, the PAS fee is non-refundable. These terms do not limit rights that cannot legally be waived.</li>
      </ul>

      <h3 className="mt-6 font-heading text-lg font-semibold">Information & Acceptable Use</h3>
      <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#D7D6E4]">
        <li>ChudACO uses the information you submit to configure and operate ACO entries, attempt requested checkouts, communicate with you, administer billing, and protect the service. Information may be processed or stored by service providers supporting these activities.</li>
        <li>Account settings and records may be retained after a product release for account operation, billing, security, dispute resolution, and legal obligations. Not all information is automatically deleted when a release ends or an order is placed.</li>
        <li>Do not submit false, fraudulent, or unauthorized information, misuse the service, interfere with its operation, or use it in violation of applicable law. ChudACO may refuse or suspend service when it reasonably believes these terms have been violated or the service is at risk.</li>
      </ul>

      <h3 className="mt-6 font-heading text-lg font-semibold">Liability</h3>
      <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#D7D6E4]">
        <li>To the extent permitted by law, ChudACO is not liable for indirect, incidental, special, or consequential loss, including lost profits, missed releases, or retailer account actions arising from your authorized use of ACO services.</li>
        <li>To the extent permitted by law, ChudACO&apos;s total liability for a claim relating to a checkout is limited to the PAS fees you paid or owe for the checkout giving rise to that claim. Nothing in these terms excludes liability that applicable law does not allow us to exclude or limit.</li>
        <li>You agree to be responsible for claims and costs arising from your unauthorized use of another person&apos;s account or payment method, or your material breach of these terms, except to the extent caused by ChudACO&apos;s own conduct.</li>
      </ul>

      <h3 className="mt-6 font-heading text-lg font-semibold">Agreement</h3>
      <p className="mt-2 max-w-[68ch]">These terms apply to your use of ChudACO and each ACO account you submit. By submitting an ACO or continuing to use the service, you confirm that you have read and agreed to them.</p>
      {showRoleNote ? (
        <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">To grab your ACO Role, head to the self-role channel on Discord and tap the <strong>Cop Access</strong> role.</p>
      ) : null}
    </section>
  );
}