import { BillingStatus, CheckoutStatus, FeeType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.billingEntry.deleteMany();
  await prisma.checkout.deleteMany();
  await prisma.acoAccount.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.pricingRule.deleteMany();
  await prisma.user.deleteMany();

  const demoUser = await prisma.user.create({
    data: {
      discordId: "123456789012345678",
      username: "demo_user",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
      shippingName: "Demo Shopper",
      shippingPhone: "555-0100",
      shippingAddr: "123 Checkout Lane",
      shippingCity: "Phoenix",
      shippingState: "AZ",
      shippingZip: "85001",
      notifyOnSuccess: true,
      notifyOnFailure: true,
      notifyWeeklySummary: false,
    },
  });

  await prisma.paymentMethod.createMany({
    data: [
      {
        key: "venmo",
        label: "Venmo",
        handle: "@chudaco-pas",
        note: "Use your ticket code in the payment note.",
      },
      {
        key: "zelle",
        label: "Zelle",
        handle: "pay@chudaco.io",
        note: "Send from your registered email if possible.",
      },
      {
        key: "cashapp",
        label: "Cash App",
        handle: "$ChudACOPAS",
        note: "Include your ticket code in the memo.",
      },
    ],
  });

  await prisma.pricingRule.createMany({
    data: [
      {
        category: "Single packs/blisters",
        priceRangeLabel: "Under $15",
        feeType: FeeType.flat,
        feeFlat: "3.00",
        feePercent: null,
        sortOrder: 1,
      },
      {
        category: "Booster Bundles",
        priceRangeLabel: "$15–$60",
        feeType: FeeType.flat,
        feeFlat: "9.00",
        feePercent: null,
        sortOrder: 2,
      },
      {
        category: "Elite Trainer Boxes",
        priceRangeLabel: "$40–$70",
        feeType: FeeType.flat,
        feeFlat: "8.00",
        feePercent: null,
        sortOrder: 3,
      },
      {
        category: "Booster Boxes/Cases",
        priceRangeLabel: "$100+",
        feeType: FeeType.percent,
        feeFlat: null,
        feePercent: "12.00",
        sortOrder: 4,
      },
      {
        category: "Special collections & tins",
        priceRangeLabel: "Any",
        feeType: FeeType.flat,
        feeFlat: "6.00",
        feePercent: null,
        sortOrder: 5,
      },
    ],
  });

  const checkoutInputs = [
    {
      retailer: "Target",
      item: "Prismatic Evolutions Booster Bundle",
      qtyLabel: "Qty 1",
      price: "39.99",
      status: CheckoutStatus.success,
      trackingNumber: "1Z999AA10123456784",
      ticketCode: "TKT-88421",
      feeAmount: "9.00",
      billingStatus: BillingStatus.paid,
    },
    {
      retailer: "Walmart",
      item: "151 Elite Trainer Box",
      qtyLabel: "Qty 1",
      price: "54.99",
      status: CheckoutStatus.success,
      trackingNumber: "9400110898825022579493",
      ticketCode: "TKT-88422",
      feeAmount: "8.00",
      billingStatus: BillingStatus.paid,
    },
    {
      retailer: "Pokémon Center",
      item: "Paldean Fates Booster Bundle",
      qtyLabel: "Qty 2",
      price: "59.98",
      status: CheckoutStatus.pending,
      trackingNumber: null,
      ticketCode: "TKT-88423",
      feeAmount: "9.00",
      billingStatus: BillingStatus.due,
    },
    {
      retailer: "Target",
      item: "Scarlet & Violet Booster Box",
      qtyLabel: "Qty 1",
      price: "114.99",
      status: CheckoutStatus.failed,
      trackingNumber: null,
      ticketCode: "TKT-88424",
      feeAmount: "13.80",
      billingStatus: BillingStatus.overdue,
    },
    {
      retailer: "Walmart",
      item: "Charizard ex Special Collection",
      qtyLabel: "Qty 1",
      price: "29.99",
      status: CheckoutStatus.success,
      trackingNumber: "420850019261290249338877500000000000",
      ticketCode: "TKT-88425",
      feeAmount: "6.00",
      billingStatus: BillingStatus.due,
    },
    {
      retailer: "Pokémon Center",
      item: "Twilight Masquerade Booster Bundle",
      qtyLabel: "Qty 1",
      price: "34.99",
      status: CheckoutStatus.pending,
      trackingNumber: null,
      ticketCode: "TKT-88426",
      feeAmount: "9.00",
      billingStatus: BillingStatus.due,
    },
  ];

  for (const entry of checkoutInputs) {
    const checkout = await prisma.checkout.create({
      data: {
        userId: demoUser.id,
        retailer: entry.retailer,
        item: entry.item,
        qtyLabel: entry.qtyLabel,
        price: entry.price,
        status: entry.status,
        trackingNumber: entry.trackingNumber,
        ticketCode: entry.ticketCode,
      },
    });

    const paidMarkedAt = entry.billingStatus === BillingStatus.paid ? new Date() : null;
    const confirmedAt = entry.billingStatus === BillingStatus.paid ? new Date() : null;

    await prisma.billingEntry.create({
      data: {
        userId: demoUser.id,
        checkoutId: checkout.id,
        feeAmount: entry.feeAmount,
        status: entry.billingStatus,
        paidMarkedAt,
        confirmedAt,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });