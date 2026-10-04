/**
 * Plain-language policy TEMPLATES. They describe how the product actually works but are NOT legal advice.
 * Have them reviewed (Digital Personal Data Protection Act 2023, Consumer Protection (E-Commerce) Rules 2020) before launch,
 * and fill in the company's legal name, address and grievance officer details.
 */
export const LEGAL = {
  terms: { title: 'Terms & Conditions', sections: [
    ['About the service', 'MyRepairUnder100 connects you with technicians for repair and maintenance of home appliances in our service areas in Delhi NCR.'],
    ['Prices', 'Service prices are shown in the app before you book. Prices marked “starting at” cover the visit and labour described. Spare parts and additional work are charged only after you approve them in the app.'],
    ['Bookings', 'A booking is confirmed when you receive a confirmation in the app. Technician arrival times are estimates and may vary due to traffic and earlier jobs.'],
    ['Your responsibilities', 'Please provide accurate address and appliance details, ensure safe access to the appliance, and be available (or nominate someone) at the booked time.'],
    ['Payments', 'You can pay online through our payment partner or, where enabled, after the service. We never store your card or UPI details.'],
    ['Warranty', 'Where a service shows a warranty period, it covers the work performed and parts replaced by us for that period, as shown on your invoice.'],
    ['Grievances', 'Raise a ticket from Help & Support. Grievance officer details: [to be added by the company].'],
  ] as [string, string][] },
  privacy: { title: 'Privacy Policy', sections: [
    ['What we collect', 'Mobile number (for login), name, service addresses, booking and payment status, and your location when you allow it. We do not collect more than we need to deliver the service.'],
    ['How we use location', 'Your location is used to show availability, fill in your address and help the technician reach you. Technician location is shared with you only while they are travelling to your booking.'],
    ['Sharing', 'Your name, address and phone are shared with the assigned technician only for the active job. Payments are processed by our payment partner. We do not sell your data.'],
    ['Security', 'Data is transmitted over HTTPS. Service addresses are encrypted at rest. OTPs are never stored in readable form.'],
    ['Your rights', 'You can view and edit your profile and addresses, and delete your account from Profile → Delete account. Some records (invoices, payments) are retained as required by law.'],
    ['Contact', 'For privacy requests, raise a ticket from Help & Support.'],
  ] as [string, string][] },
  cancellation: { title: 'Cancellation & Refund Policy', sections: [
    ['Cancelling a booking', 'You can cancel from the booking screen. Cancellation is free before a technician is assigned and until the free-cancellation window shown in the app. After that, a cancellation fee shown in the app may apply.'],
    ['If we cancel', 'If we or our technician cancel, you are never charged a cancellation fee.'],
    ['Refunds', 'Wallet amounts return to your wallet instantly. Online payments are refunded to the original method (usually 5–7 working days) or to your wallet, as shown in the app.'],
    ['Failed payments', 'If money is debited but the payment fails, it is automatically confirmed or reversed by your bank.'],
  ] as [string, string][] },
} as const;
