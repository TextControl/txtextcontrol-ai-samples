namespace TXTextControl.AI.Web;

public sealed class AiWorkspaceOptions
{
    public string Title { get; set; } = "TX Text Control AI";
    public string ApiBaseUrl { get; set; } = "~/api";
    public string? DefaultSampleName { get; set; }
    public string LogoUrl { get; set; } = "~/images/txai.svg";
    public string? StylesheetUrl { get; set; }
    public bool ShowRuntimeSettings { get; set; } = true;
    public string Credentials { get; set; } = "same-origin";
}
