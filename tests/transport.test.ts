import {describe,it,expect,vi,afterEach} from 'vitest';
vi.mock('undici',()=>({Agent:class Agent{},fetch:vi.fn(async()=>new Response('{}',{status:200}))}));
const {externalFetch,publicIp}=await import('../server/panel');
const transport=await import('undici');
afterEach(()=>vi.restoreAllMocks());
describe('hosting HTTP transport',()=>{
  it('uses the matching Undici fetch and Agent implementation',async()=>{const native=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('Native fetch must not receive a different Undici major-version dispatcher'));const response=await externalFetch(new URL('https://dash.pulikesiyt.fun/api/client'));expect(response.status).toBe(200);expect(native).not.toHaveBeenCalled();expect(transport.fetch).toHaveBeenCalledWith(expect.any(URL),expect.objectContaining({redirect:'error',dispatcher:expect.anything()}));});
  it('refuses arbitrary hosts and non-HTTPS destinations',async()=>{await expect(externalFetch(new URL('https://unapproved.example/file'))).rejects.toThrow('Unapproved');await expect(externalFetch(new URL('http://dash.pulikesiyt.fun/api/client'))).rejects.toThrow('Unapproved');});
  it.each(['127.0.0.1','10.0.0.1','192.168.1.1','169.254.169.254','172.16.0.1','100.64.0.1','::1','fd00::1','fe80::1'])('blocks private and local IP %s',ip=>expect(publicIp(ip)).toBe(false));
});
