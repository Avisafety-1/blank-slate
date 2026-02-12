import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AVISAFE_COMPANY_ID = "a6698b2d-8464-4f88-9bc4-ebcc072f629d";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Use service role to verify superadmin + Avisafe company
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Check user role
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (!roleData || roleData.role !== "superadmin") {
      return new Response(JSON.stringify({ error: "Forbidden: superadmin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check company
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await admin
      .from("companies")
      .select("navn")
      .eq("id", profile.company_id)
      .single();

    if (!company || company.navn.toLowerCase() !== "avisafe") {
      return new Response(
        JSON.stringify({ error: "Forbidden: must be logged in as Avisafe" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse params
    const url = new URL(req.url);
    const excludeAvisafe = url.searchParams.get("exclude_avisafe") === "true";

    const companyFilter = excludeAvisafe ? AVISAFE_COMPANY_ID : null;

    // Helper: add company exclusion filter
    const applyFilter = (query: any) => {
      if (companyFilter) {
        return query.neq("company_id", companyFilter);
      }
      return query;
    };

    // ---- Fetch all data in parallel ----
    const [
      companiesRes,
      profilesRes,
      flightLogsRes,
      incidentsRes,
      dronesRes,
      missionsRes,
    ] = await Promise.all([
      admin.from("companies").select("id, aktiv, created_at"),
      admin.from("profiles").select("id, approved, created_at, company_id"),
      applyFilter(
        admin.from("flight_logs").select(
          "id, flight_date, flight_duration_minutes, safesky_mode, completed_checklists, company_id"
        )
      ),
      applyFilter(
        admin.from("incidents").select(
          "id, hendelsestidspunkt, alvorlighetsgrad, company_id"
        )
      ),
      applyFilter(admin.from("drones").select("id, flyvetimer, company_id")),
      applyFilter(admin.from("missions").select("id, tidspunkt, status, company_id")),
    ]);

    const companies = companiesRes.data || [];
    let profiles = profilesRes.data || [];
    const flightLogs = flightLogsRes.data || [];
    const incidents = incidentsRes.data || [];
    const drones = dronesRes.data || [];
    const missions = missionsRes.data || [];

    // Filter profiles if excluding avisafe
    if (companyFilter) {
      profiles = profiles.filter((p: any) => p.company_id !== companyFilter);
    }

    // Filter companies if excluding avisafe
    const filteredCompanies = companyFilter
      ? companies.filter((c: any) => c.id !== companyFilter)
      : companies;

    // ---- KPIs ----
    const activeCompanies = filteredCompanies.filter((c: any) => c.aktiv).length;
    const approvedUsers = profiles.filter((p: any) => p.approved).length;
    const totalFlights = flightLogs.length;
    const totalFlightMinutes = flightLogs.reduce(
      (sum: number, f: any) => sum + (f.flight_duration_minutes || 0),
      0
    );
    const totalFlightHours = Math.round((totalFlightMinutes / 60) * 10) / 10;
    const totalIncidents = incidents.length;
    const totalDrones = drones.length;
    const totalMissions = missions.length;

    // ---- Monthly trends (last 12 months) ----
    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    const getYearMonth = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    // Flights per month
    const flightsPerMonth = months.map((m) => ({
      month: m,
      count: flightLogs.filter((f: any) => getYearMonth(f.flight_date) === m).length,
    }));

    // Flight hours per month
    const flightHoursPerMonth = months.map((m) => ({
      month: m,
      hours: Math.round(
        flightLogs
          .filter((f: any) => getYearMonth(f.flight_date) === m)
          .reduce((sum: number, f: any) => sum + (f.flight_duration_minutes || 0), 0) / 60 * 10
      ) / 10,
    }));

    // Incidents per month
    const incidentsPerMonth = months.map((m) => ({
      month: m,
      count: incidents.filter((i: any) => getYearMonth(i.hendelsestidspunkt) === m).length,
    }));

    // New users per month
    const usersPerMonth = months.map((m) => ({
      month: m,
      count: profiles.filter((p: any) => p.created_at && getYearMonth(p.created_at) === m).length,
    }));

    // ---- Incidents by severity ----
    const severityCounts: Record<string, number> = {};
    incidents.forEach((i: any) => {
      severityCounts[i.alvorlighetsgrad] = (severityCounts[i.alvorlighetsgrad] || 0) + 1;
    });
    const incidentsBySeverity = Object.entries(severityCounts).map(([name, value]) => ({
      name,
      value,
    }));

    // ---- Top 10 companies by flight hours ----
    // Need company names
    const companyMap: Record<string, string> = {};
    filteredCompanies.forEach((c: any) => {
      companyMap[c.id] = c.id; // We'll resolve names below
    });

    // Get company names
    const { data: allCompanyNames } = await admin.from("companies").select("id, navn");
    const nameMap: Record<string, string> = {};
    (allCompanyNames || []).forEach((c: any) => {
      nameMap[c.id] = c.navn;
    });

    // Aggregate flight hours by company from flight_logs
    const flightHoursByCompany: Record<string, number> = {};
    flightLogs.forEach((f: any) => {
      flightHoursByCompany[f.company_id] =
        (flightHoursByCompany[f.company_id] || 0) + (f.flight_duration_minutes || 0);
    });

    const topCompaniesByHours = Object.entries(flightHoursByCompany)
      .map(([id, mins]) => ({ name: nameMap[id] || id, hours: Math.round((mins / 60) * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    // ---- Top 10 companies by missions ----
    const missionsByCompany: Record<string, number> = {};
    missions.forEach((m: any) => {
      missionsByCompany[m.company_id] = (missionsByCompany[m.company_id] || 0) + 1;
    });

    const topCompaniesByMissions = Object.entries(missionsByCompany)
      .map(([id, count]) => ({ name: nameMap[id] || id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ---- Missions by status ----
    const missionStatusCounts: Record<string, number> = {};
    missions.forEach((m: any) => {
      missionStatusCounts[m.status] = (missionStatusCounts[m.status] || 0) + 1;
    });
    const missionsByStatus = Object.entries(missionStatusCounts).map(([name, value]) => ({
      name,
      value,
    }));

    // ---- Extra metrics ----
    const safeskyFlights = flightLogs.filter(
      (f: any) => f.safesky_mode && f.safesky_mode !== "none"
    ).length;
    const safeskyRate = totalFlights > 0 ? Math.round((safeskyFlights / totalFlights) * 1000) / 10 : 0;

    const checklistFlights = flightLogs.filter(
      (f: any) => f.completed_checklists && f.completed_checklists.length > 0
    ).length;
    const checklistRate = totalFlights > 0 ? Math.round((checklistFlights / totalFlights) * 1000) / 10 : 0;

    const avgFlightMinutes = totalFlights > 0 ? Math.round(totalFlightMinutes / totalFlights) : 0;

    const incidentFrequency =
      totalFlightHours > 0
        ? Math.round((totalIncidents / totalFlightHours) * 100 * 100) / 100
        : 0;

    const result = {
      kpis: {
        activeCompanies,
        approvedUsers,
        totalFlights,
        totalFlightHours,
        totalIncidents,
        totalDrones,
        totalMissions,
      },
      trends: {
        flightsPerMonth,
        flightHoursPerMonth,
        incidentsPerMonth,
        usersPerMonth,
      },
      distributions: {
        incidentsBySeverity,
        missionsByStatus,
      },
      rankings: {
        topCompaniesByHours,
        topCompaniesByMissions,
      },
      metrics: {
        safeskyRate,
        checklistRate,
        avgFlightMinutes,
        incidentFrequency,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Platform statistics error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
