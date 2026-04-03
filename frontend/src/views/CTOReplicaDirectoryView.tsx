import { useEffect, useState } from "react";

import { communicationApi } from "../api/client";
import CTOReplicaDirectory from "../components/cto-page/CTOReplicaDirectory";
import type { TavusReplica } from "../components/cto-page/types";

export default function CTOReplicaDirectoryView() {
  const [replicas, setReplicas] = useState<TavusReplica[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    communicationApi.replicas()
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setReplicas(response.data.replicas ?? []);
        setError(null);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setError("Could not load the full CTO directory right now.");
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <CTOReplicaDirectory
      replicas={replicas}
      loading={loading}
      error={error}
    />
  );
}
