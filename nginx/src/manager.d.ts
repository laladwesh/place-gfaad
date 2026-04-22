export interface ConfigureRoutingInput {
    siteName: string;
    subdomain: string;
    port: number;
    rootDomain: string;
    sitesAvailableDir?: string;
    sitesEnabledDir?: string;
    nginxBinary?: string;
}
export declare function renderNginxConfig(subdomain: string, rootDomain: string, port: number): string;
export declare function testNginxConfig(nginxBinary: string): Promise<void>;
export declare function reloadNginx(nginxBinary: string): Promise<void>;
export declare function configureProjectRouting(input: ConfigureRoutingInput): Promise<{
    configPath: string;
    enabledPath: string;
}>;
//# sourceMappingURL=manager.d.ts.map