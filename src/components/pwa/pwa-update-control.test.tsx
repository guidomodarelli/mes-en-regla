import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PwaUpdateControl } from "./pwa-update-control";

type MockServiceWorker = {
  postMessage: jest.Mock;
};

type MockServiceWorkerRegistration = {
  addEventListener: jest.Mock;
  installing: null;
  removeEventListener: jest.Mock;
  update: jest.Mock;
  waiting: MockServiceWorker | null;
};

type MockServiceWorkerContainer = {
  addEventListener: jest.Mock;
  controller: object;
  getRegistration: jest.Mock;
  removeEventListener: jest.Mock;
};

function setMockServiceWorkerEnvironment(
  registration: MockServiceWorkerRegistration,
) {
  const serviceWorkerContainer: MockServiceWorkerContainer = {
    addEventListener: jest.fn(),
    controller: {},
    getRegistration: jest.fn().mockResolvedValue(registration),
    removeEventListener: jest.fn(),
  };

  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorkerContainer,
  });

  return serviceWorkerContainer;
}

describe("PwaUpdateControl", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("stays hidden when there is no waiting worker", async () => {
    const registration: MockServiceWorkerRegistration = {
      addEventListener: jest.fn(),
      installing: null,
      removeEventListener: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      waiting: null,
    };

    setMockServiceWorkerEnvironment(registration);

    render(<PwaUpdateControl />);

    await waitFor(() => {
      expect(registration.update).toHaveBeenCalled();
    });

    expect(screen.queryByText("Hay una nueva versión")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Actualizar app",
      }),
    ).not.toBeInTheDocument();
  });

  it("shows update badge when a waiting worker exists", async () => {
    const registration: MockServiceWorkerRegistration = {
      addEventListener: jest.fn(),
      installing: null,
      removeEventListener: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      waiting: {
        postMessage: jest.fn(),
      },
    };

    setMockServiceWorkerEnvironment(registration);

    render(<PwaUpdateControl />);

    expect(await screen.findByText("Hay una nueva versión")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Actualizar app",
      }),
    ).toBeInTheDocument();
  });

  it("checks for updates and asks waiting worker to skip waiting", async () => {
    const user = userEvent.setup();
    const waitingWorker = {
      postMessage: jest.fn(),
    };
    const registration: MockServiceWorkerRegistration = {
      addEventListener: jest.fn(),
      installing: null,
      removeEventListener: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      waiting: waitingWorker,
    };

    setMockServiceWorkerEnvironment(registration);

    render(<PwaUpdateControl />);

    await user.click(
      await screen.findByRole("button", {
        name: "Actualizar app",
      }),
    );

    await waitFor(() => {
      expect(registration.update).toHaveBeenCalled();
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({
        type: "SKIP_WAITING",
      });
    });
  });
});
