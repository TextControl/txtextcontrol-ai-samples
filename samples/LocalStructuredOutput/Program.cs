using TXTextControl.AI;

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: LocalStructuredOutput <model.gguf>");
    return 1;
}

await using LocalLanguageModel model = await LocalLanguageModel.LoadAsync(args[0]);
InvoiceData invoice = await model.GetStructuredResponseAsync<InvoiceData>(
    "Extract an invoice for ACME Corporation, invoice AC-1007, dated 2026-09-02, total EUR 1234.56.");

Console.WriteLine($"Invoice: {invoice.InvoiceNumber}");
Console.WriteLine($"Date: {invoice.InvoiceDate:d}");
Console.WriteLine($"Customer: {invoice.Customer}");
Console.WriteLine($"Total: {invoice.Total:F2}");
return 0;

internal sealed record InvoiceData(
    string InvoiceNumber,
    DateTime InvoiceDate,
    string Customer,
    decimal Total);
